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

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "sales_agent"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const q = new URL(request.url).searchParams.get("q")?.trim();

    let query = supabaseAdmin
      .from("leads")
      .select("id, user_id, session_id, phone, funnel_stage_at_creation, generations_count, status, source, assigned_agent_id, crm_lead_id, created_at, updated_at, agent_actions(id, action_type, notes, credit_amount, created_at)")
      .order("created_at", { ascending: false });

    if (admin.role === "sales_agent") {
      query = query.or(`assigned_agent_id.eq.${admin.id},assigned_agent_id.is.null`);
    }

    // Agent search — by phone or the CRM's lead id.
    if (q) {
      query = query.or(`phone.ilike.%${q}%,crm_lead_id.ilike.%${q}%`);
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
