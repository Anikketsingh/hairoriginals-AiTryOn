/**
 * lib/leads.ts
 *
 * Shared CRM-lead lifecycle helpers. Consolidates the lead-creation logic that
 * previously lived (duplicated) in app/api/generate/route.ts and app/api/leads/
 * route.ts, and adds the activity-refresh path used to keep the DC CRM (the
 * master) in sync as a user creates looks.
 *
 * Server-only — imports lib/supabase/server.ts.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { dispatchIntegrationEvent } from "@/lib/event-bus";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { getAppBaseUrl } from "@/lib/app-url";

/** Cap on how many recent looks we attach to a payload. */
const CRM_MAX_LOOKS = 5;

/**
 * Stable, non-expiring image URL for the CRM. Points at our media proxy
 * (app/api/crm-media/[id]/[kind]), which 302s to a fresh signed URL per request
 * — so the URL we hand Digicuro never goes dead (their signed URLs would expire
 * in ~30 days, and they don't re-host our images).
 */
export function crmMediaUrl(generationId: string, kind: "result" | "source"): string {
  return `${getAppBaseUrl()}/api/crm-media/${generationId}/${kind}`;
}

export type LeadSource =
  | "agent_gate"
  | "talk_to_expert"
  | "manual"
  | "registration"
  | "guest_tryon";

interface OwnerRef {
  sessionId: string | null;
  userId: string | null;
}

/** OR filter matching a lead/generation owned by this session or user. */
function ownerFilter({ sessionId, userId }: OwnerRef): string {
  return userId && sessionId
    ? `user_id.eq.${userId},session_id.eq.${sessionId}`
    : userId
    ? `user_id.eq.${userId}`
    : `session_id.eq.${sessionId}`;
}

/** Distinct catalog product ids this owner has generated with (their "interested in"). */
async function getProductsTried({ sessionId, userId }: OwnerRef): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("generations")
    .select("product_id")
    .or(ownerFilter({ sessionId, userId }))
    .not("product_id", "is", null);

  const ids = new Set<string>();
  (data ?? []).forEach((r) => r.product_id && ids.add(r.product_id as string));
  return [...ids];
}

/** Stored source-photo paths for this owner, newest first (their selfie_refs). */
async function getSourcePhotoPaths({ sessionId, userId }: OwnerRef): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("generations")
    .select("source_image_path")
    .or(ownerFilter({ sessionId, userId }))
    .not("source_image_path", "is", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => r.source_image_path as string);
}

/** Count of completed generations for this owner. */
async function getCompletedCount({ sessionId, userId }: OwnerRef): Promise<number> {
  const { count } = await supabaseAdmin
    .from("generations")
    .select("id", { count: "exact", head: true })
    .or(ownerFilter({ sessionId, userId }))
    .eq("status", "completed");
  return count ?? 0;
}

/** Expand product ids → lightweight summaries for the outbound CRM payload. */
async function summariseProducts(ids: string[]): Promise<Array<{ id: string; name: string; price: number | null }>> {
  if (ids.length === 0) return [];
  const { data } = await supabaseAdmin
    .from("products")
    .select("id, name, selling_price, price")
    .in("id", ids);
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    price: (p.selling_price as number | null) ?? (p.price as number | null) ?? null,
  }));
}

export interface LeadMedia {
  /** Stable proxy URL of the customer's most recent generated look (null if none yet). */
  generatedLookUrl: string | null;
  /** Stable proxy URL of the original photo behind that latest look (null if not stored). */
  originalPhotoUrl: string | null;
  /** A few recent looks (newest first) so the CRM can show a small gallery. */
  looks: Array<{
    resultUrl: string | null;
    originalPhotoUrl: string | null;
    productName: string | null;
    createdAt: string;
  }>;
}

const EMPTY_MEDIA: LeadMedia = { generatedLookUrl: null, originalPhotoUrl: null, looks: [] };

/**
 * Collect the customer's recent generated looks + original photos as stable,
 * non-expiring proxy URLs (see crmMediaUrl) for the outbound CRM payload.
 * Best-effort — returns empty media on any error or when the owner has no
 * completed generations yet.
 */
async function getLeadMediaUrls({ sessionId, userId }: OwnerRef): Promise<LeadMedia> {
  try {
    const { data: gens } = await supabaseAdmin
      .from("generations")
      .select("id, result_image_path, source_image_path, created_at, products(name)")
      .or(ownerFilter({ sessionId, userId }))
      .eq("status", "completed")
      .not("result_image_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(CRM_MAX_LOOKS);

    if (!gens || gens.length === 0) return EMPTY_MEDIA;

    const looks = gens.map((g) => ({
      resultUrl: g.result_image_path ? crmMediaUrl(g.id as string, "result") : null,
      originalPhotoUrl: g.source_image_path ? crmMediaUrl(g.id as string, "source") : null,
      productName: (g.products as { name?: string } | null)?.name ?? null,
      createdAt: g.created_at as string,
    }));

    return {
      generatedLookUrl: looks[0]?.resultUrl ?? null,
      originalPhotoUrl: looks[0]?.originalPhotoUrl ?? null,
      looks,
    };
  } catch (err) {
    console.error("[leads] getLeadMediaUrls error:", err);
    return EMPTY_MEDIA;
  }
}

interface Contact {
  phone: string | null;
  name: string | null;
  email: string | null;
}

/**
 * The customer's contact details for the outbound CRM payload. Digicuro dedups
 * and identifies leads on phone/email, so every event carries these. Empty for
 * a pre-signup guest (no user row yet) — such events are skipped at delivery
 * time until the customer registers (see lib/webhooks/delivery.ts).
 */
async function resolveContact(userId: string | null): Promise<Contact> {
  if (!userId) return { phone: null, name: null, email: null };
  const { data } = await supabaseAdmin
    .from("users")
    .select("phone, name, email")
    .eq("id", userId)
    .single();
  return {
    phone: (data?.phone as string | null) ?? null,
    name: (data?.name as string | null) ?? null,
    email: (data?.email as string | null) ?? null,
  };
}

/**
 * Idempotently ensure a CRM lead exists for this session/user. On first
 * creation it enriches the lead with phone / generation count / products tried,
 * dispatches `lead.created` to the CRM, and records the `lead_created`
 * analytics event. Returns the lead id (existing or new).
 */
export async function ensureLeadForSession(params: {
  sessionId: string | null;
  userId: string | null;
  source: LeadSource;
  funnelStage: number;
}): Promise<{ leadId: string | null; created: boolean }> {
  const { sessionId, userId, source, funnelStage } = params;
  if (!sessionId && !userId) return { leadId: null, created: false };

  try {
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("id, user_id")
      .or(ownerFilter({ sessionId, userId }))
      .limit(1);

    if (existing && existing.length > 0) {
      const lead = existing[0];

      // The lead was created while this person was still a guest (source
      // 'guest_tryon' on their first try-on) and they've now signed in —
      // claim it in place rather than leaving it anonymous forever. Without
      // this, every sign-in matches the guest lead by session_id and returns
      // untouched, so no lead would ever carry a user_id or phone.
      if (userId && !lead.user_id) {
        const [contact, media] = await Promise.all([
          resolveContact(userId),
          getLeadMediaUrls({ sessionId, userId }),
        ]);
        await supabaseAdmin
          .from("leads")
          .update({ user_id: userId, phone: contact.phone, updated_at: new Date().toISOString() })
          .eq("id", lead.id);

        await dispatchIntegrationEvent(
          "lead.updated",
          {
            leadId: lead.id,
            userId,
            sessionId,
            phone: contact.phone,
            name: contact.name,
            email: contact.email,
            source,
            generatedLookUrl: media.generatedLookUrl,
            originalPhotoUrl: media.originalPhotoUrl,
            looks: media.looks,
            occurredAt: new Date().toISOString(),
          },
          "crm"
        );
      }

      return { leadId: lead.id as string, created: false };
    }

    const [contact, generationsCount, productsTried] = await Promise.all([
      resolveContact(userId),
      getCompletedCount({ sessionId, userId }),
      getProductsTried({ sessionId, userId }),
    ]);

    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .insert({
        user_id: userId ?? null,
        session_id: sessionId,
        phone: contact.phone,
        funnel_stage_at_creation: funnelStage,
        generations_count: generationsCount,
        products_tried: productsTried,
        source,
      })
      .select("id")
      .single();

    if (error || !lead) {
      console.error("[leads] ensureLeadForSession insert error:", error?.message);
      return { leadId: null, created: false };
    }

    const [products, media] = await Promise.all([
      summariseProducts(productsTried),
      getLeadMediaUrls({ sessionId, userId }),
    ]);
    await dispatchIntegrationEvent(
      "lead.created",
      {
        leadId: lead.id,
        userId,
        sessionId,
        phone: contact.phone,
        name: contact.name,
        email: contact.email,
        source,
        funnelStage,
        generationsCount,
        products,
        generatedLookUrl: media.generatedLookUrl,
        originalPhotoUrl: media.originalPhotoUrl,
        looks: media.looks,
        occurredAt: new Date().toISOString(),
      },
      "crm"
    );
    await recordAnalyticsEvent("lead_created", { source }, sessionId, userId);

    return { leadId: lead.id as string, created: true };
  } catch (err) {
    console.error("[leads] ensureLeadForSession error:", err);
    return { leadId: null, created: false };
  }
}

/**
 * Refresh an existing lead's activity snapshot (generation count + products
 * tried) and dispatch `lead.updated` so the CRM master sees engagement in near
 * real time. No-op if the owner has no lead yet (e.g. a guest pre-signup).
 */
export async function refreshLeadActivity({ sessionId, userId }: OwnerRef): Promise<void> {
  if (!sessionId && !userId) return;
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .or(ownerFilter({ sessionId, userId }))
      .limit(1)
      .maybeSingle();

    if (!lead) return;

    const [generationsCount, productsTried, selfieRefs] = await Promise.all([
      getCompletedCount({ sessionId, userId }),
      getProductsTried({ sessionId, userId }),
      getSourcePhotoPaths({ sessionId, userId }),
    ]);

    await supabaseAdmin
      .from("leads")
      .update({
        generations_count: generationsCount,
        products_tried: productsTried,
        selfie_refs: selfieRefs,
        // Customer just completed another try-on — bump the "returning
        // customer" signal the CRM sorts and badges on. Unlike updated_at
        // (bumped by agent actions too), this only moves on customer activity.
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    const [products, media, contact] = await Promise.all([
      summariseProducts(productsTried),
      getLeadMediaUrls({ sessionId, userId }),
      resolveContact(userId),
    ]);
    await dispatchIntegrationEvent(
      "lead.updated",
      {
        leadId: lead.id,
        userId,
        sessionId,
        phone: contact.phone,
        name: contact.name,
        email: contact.email,
        generationsCount,
        products,
        generatedLookUrl: media.generatedLookUrl,
        originalPhotoUrl: media.originalPhotoUrl,
        looks: media.looks,
        occurredAt: new Date().toISOString(),
      },
      "crm"
    );
  } catch (err) {
    console.error("[leads] refreshLeadActivity error:", err);
  }
}