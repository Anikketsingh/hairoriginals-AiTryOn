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
import { applyLeadFilters, resolveSort } from "@/lib/lead-filters";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "sales_agent"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const params = new URL(request.url).searchParams;
    const sort = resolveSort(params);

    let query = supabaseAdmin
      .from("leads")
      .select("id, user_id, session_id, phone, funnel_stage_at_creation, generations_count, status, source, assigned_agent_id, crm_lead_id, is_read, created_at, updated_at, last_activity_at, agent_actions(id, action_type, notes, credit_amount, created_at)")
      // Tie-break on created_at so ties (e.g. equal try-on counts) stay stable.
      .order(sort.column, { ascending: sort.ascending })
      .order("created_at", { ascending: false });

    query = applyLeadFilters(query, params, admin);

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
