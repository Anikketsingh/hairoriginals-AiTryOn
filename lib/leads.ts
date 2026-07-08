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

export type LeadSource = "agent_gate" | "talk_to_expert" | "manual" | "registration";

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

async function resolvePhone(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin.from("users").select("phone").eq("id", userId).single();
  return (data?.phone as string | null) ?? null;
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
      .select("id")
      .or(ownerFilter({ sessionId, userId }))
      .limit(1);

    if (existing && existing.length > 0) {
      return { leadId: existing[0].id as string, created: false };
    }

    const [phone, generationsCount, productsTried] = await Promise.all([
      resolvePhone(userId),
      getCompletedCount({ sessionId, userId }),
      getProductsTried({ sessionId, userId }),
    ]);

    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .insert({
        user_id: userId ?? null,
        session_id: sessionId,
        phone,
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

    const products = await summariseProducts(productsTried);
    await dispatchIntegrationEvent(
      "lead.created",
      {
        leadId: lead.id,
        userId,
        sessionId,
        phone,
        source,
        funnelStage,
        generationsCount,
        products,
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

    const [generationsCount, productsTried] = await Promise.all([
      getCompletedCount({ sessionId, userId }),
      getProductsTried({ sessionId, userId }),
    ]);

    await supabaseAdmin
      .from("leads")
      .update({
        generations_count: generationsCount,
        products_tried: productsTried,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    const products = await summariseProducts(productsTried);
    await dispatchIntegrationEvent(
      "lead.updated",
      {
        leadId: lead.id,
        userId,
        sessionId,
        generationsCount,
        products,
        occurredAt: new Date().toISOString(),
      },
      "crm"
    );
  } catch (err) {
    console.error("[leads] refreshLeadActivity error:", err);
  }
}