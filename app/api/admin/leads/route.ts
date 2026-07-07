/**
 * GET /api/admin/leads
 *
 * Returns list of leads for the CRM sales agent view.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { data: leads, error } = await supabaseAdmin
      .from("leads")
      .select("id, user_id, session_id, phone, funnel_stage_at_creation, generations_count, status, source, created_at, updated_at, agent_actions(id, action_type, notes, credit_amount, created_at)")
      .order("created_at", { ascending: false });

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
