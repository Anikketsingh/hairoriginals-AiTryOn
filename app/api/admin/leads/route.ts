/**
 * GET /api/admin/leads
 *
 * Returns list of leads for the CRM sales agent view. super_admin sees every
 * lead; sales_agent sees only leads assigned to them plus unassigned leads
 * they could claim (context.md §5.1 — "leads/CRM view ... for their
 * assigned leads only").
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Sort options the CRM list offers. The default, `recent_activity`, surfaces
 * customers who've come back and generated more looks (last_activity_at is
 * bumped only on customer try-ons — see lib/leads.ts), which is the whole
 * point of the sort: returning leads bubble to the top.
 */
const SORT_OPTIONS = {
  recent_activity: { column: "last_activity_at", ascending: false },
  newest: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  most_tryons: { column: "generations_count", ascending: false },
  status: { column: "status", ascending: true },
} as const;

type SortKey = keyof typeof SORT_OPTIONS;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "sales_agent"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const params = new URL(request.url).searchParams;
    const q = params.get("q")?.trim();
    const sortParam = params.get("sort") as SortKey | null;
    const sort = sortParam && sortParam in SORT_OPTIONS ? SORT_OPTIONS[sortParam] : SORT_OPTIONS.recent_activity;
    const dateFrom = params.get("dateFrom")?.trim();
    const dateTo = params.get("dateTo")?.trim();
    // "Qualified" = has a phone we can actually call. Phone alone is enough
    // to exclude anonymous guest try-ons — a lead that's claimed (signed in)
    // gets phone/user_id patched onto its original row without its `source`
    // ever changing from "guest_tryon" (see lib/leads.ts), so filtering on
    // source as well would wrongly drop every converted guest lead.
    const qualifiedOnly = params.get("qualifiedOnly") === "true";

    let query = supabaseAdmin
      .from("leads")
      .select("id, user_id, session_id, phone, funnel_stage_at_creation, generations_count, status, source, assigned_agent_id, crm_lead_id, created_at, updated_at, last_activity_at, agent_actions(id, action_type, notes, credit_amount, created_at)")
      // Tie-break on created_at so ties (e.g. equal try-on counts) stay stable.
      .order(sort.column, { ascending: sort.ascending })
      .order("created_at", { ascending: false });

    if (admin.role === "sales_agent") {
      query = query.or(`assigned_agent_id.eq.${admin.id},assigned_agent_id.is.null`);
    }

    // Agent search — by phone or the CRM's lead id.
    if (q) {
      query = query.or(`phone.ilike.%${q}%,crm_lead_id.ilike.%${q}%`);
    }

    if (dateFrom) {
      query = query.gte("created_at", new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      // dateTo comes in as a plain YYYY-MM-DD date — push to end of that day
      // so leads created on the "to" date itself are included.
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query = query.lte("created_at", end.toISOString());
    }

    if (qualifiedOnly) {
      query = query.not("phone", "is", null);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error("[/api/admin/leads] Fetch error:", error.message);
      return NextResponse.json({ error: "Failed to fetch leads." }, { status: 500 });
    }

    return NextResponse.json(leads);
  } catch (err) {
    console.error("[/api/admin/leads] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
