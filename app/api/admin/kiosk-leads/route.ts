/**
 * GET /api/admin/kiosk-leads
 *
 * Admin → Standee Leads: people who gave their number on a standee's phone
 * page, with the standee they came from, a few look thumbnails, their
 * interest flags and their full interest timeline (kiosk_lead_events).
 *
 * Shares lib/lead-filters.ts with the Sales CRM and its export (search,
 * dates, read status, sales_agent scoping), forced to channel=kiosk, plus
 * ?kioskId= and ?interest=home_trial|photos|whatsapp|call.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { applyLeadFilters, resolveSort } from "@/lib/lead-filters";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";

const PAGE_CAP = 300;
const THUMBS_PER_LEAD = 4;
const THUMB_TTL_SECONDS = 30 * 60;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "sales_agent"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const params = new URL(request.url).searchParams;
    params.set("channel", "kiosk");
    // A standee lead is someone who gave a number. (Earlier builds made an
    // anonymous lead per visitor; those stay out of this list.)
    params.set("qualifiedOnly", "true");
    // whatsapp / call live only in the event log, filtered after the fetch.
    const eventInterest = params.get("interest");
    const sort = resolveSort(params);

    let query = supabaseAdmin
      .from("leads")
      .select(
        "id, session_id, phone, contact_name, status, generations_count, is_read, created_at, last_activity_at, home_trial_interest_at, photo_link_sent_at, kiosk_id, kiosks(name, location)"
      )
      .order(sort.column, { ascending: sort.ascending })
      .order("created_at", { ascending: false })
      .limit(PAGE_CAP);
    query = applyLeadFilters(query, params, admin);

    const { data: leads, error } = await query;
    if (error) {
      console.error("[/api/admin/kiosk-leads] Fetch error:", error.message);
      return NextResponse.json({ error: "Failed to fetch standee leads." }, { status: 500 });
    }
    const rows = leads ?? [];
    if (rows.length === 0) return NextResponse.json({ leads: [] });

    const leadIds = rows.map((l) => l.id as string);
    const sessionIds = rows.map((l) => l.session_id as string | null).filter((x): x is string => !!x);

    const [{ data: events }, { data: gens }] = await Promise.all([
      supabaseAdmin
        .from("kiosk_lead_events")
        .select("lead_id, event, meta, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("generations")
        .select("session_id, result_image_path, created_at, products(name)")
        .in("session_id", sessionIds)
        .eq("status", "completed")
        .not("result_image_path", "is", null)
        .order("created_at", { ascending: false }),
    ]);

    // Up to THUMBS_PER_LEAD looks per visit, signed in one batch.
    const looksBySession = new Map<string, { path: string; styleName: string | null }[]>();
    for (const g of gens ?? []) {
      const list = looksBySession.get(g.session_id as string) ?? [];
      if (list.length < THUMBS_PER_LEAD) {
        list.push({
          path: g.result_image_path as string,
          styleName: (g.products as { name?: string } | null)?.name ?? null,
        });
      }
      looksBySession.set(g.session_id as string, list);
    }
    const allPaths = [...looksBySession.values()].flat().map((l) => l.path);
    const { data: signed } = allPaths.length
      ? await supabaseAdmin.storage.from("results").createSignedUrls(allPaths, THUMB_TTL_SECONDS)
      : { data: [] };
    const urlByPath = new Map<string, string>();
    (signed ?? []).forEach((s, i) => {
      const url = toPublicStorageUrl(s?.signedUrl);
      if (url) urlByPath.set(allPaths[i], url);
    });

    const eventsByLead = new Map<string, { event: string; meta: unknown; createdAt: string }[]>();
    for (const e of events ?? []) {
      const list = eventsByLead.get(e.lead_id as string) ?? [];
      list.push({ event: e.event as string, meta: e.meta, createdAt: e.created_at as string });
      eventsByLead.set(e.lead_id as string, list);
    }

    let result = rows.map((l) => {
      const timeline = eventsByLead.get(l.id as string) ?? [];
      const has = (ev: string) => timeline.some((t) => t.event === ev);
      const kiosk = l.kiosks as { name?: string; location?: string | null } | null;
      return {
        id: l.id as string,
        name: (l.contact_name as string | null) ?? null,
        phone: (l.phone as string | null) ?? null,
        status: l.status as string,
        isRead: l.is_read as boolean,
        generationsCount: l.generations_count as number,
        createdAt: l.created_at as string,
        lastActivityAt: (l.last_activity_at as string | null) ?? null,
        kiosk: { id: l.kiosk_id as string, name: kiosk?.name ?? "Unknown standee", location: kiosk?.location ?? null },
        interests: {
          homeTrial: (l.home_trial_interest_at as string | null) ?? null,
          photosSent: (l.photo_link_sent_at as string | null) ?? null,
          whatsapp: has("whatsapp_clicked"),
          call: has("call_clicked"),
          store: has("store_clicked"),
        },
        looks: (looksBySession.get(l.session_id as string) ?? [])
          .map((look) => ({ url: urlByPath.get(look.path) ?? null, styleName: look.styleName }))
          .filter((look) => look.url),
        timeline,
      };
    });

    if (eventInterest === "whatsapp") result = result.filter((l) => l.interests.whatsapp);
    if (eventInterest === "call") result = result.filter((l) => l.interests.call);

    return NextResponse.json({ leads: result });
  } catch (err) {
    console.error("[/api/admin/kiosk-leads] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
