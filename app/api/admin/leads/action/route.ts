/**
 * POST /api/admin/leads/action
 *
 * Records sales agent actions (notes, calls, status changes, credit grants).
 * Body: { leadId: string, actionType: 'note' | 'call' | 'credit_grant' | 'status_change', notes?: string, status?: string, creditAmount?: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/funnel";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, actionType, notes, status, creditAmount } = body;

    if (!leadId || !actionType) {
      return NextResponse.json({ error: "Missing leadId or actionType." }, { status: 400 });
    }

    // 1. Get lead details to resolve owner (user_id / session_id)
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, user_id, session_id")
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    // 2. If actionType is credit_grant (Stage 4 grant by agent)
    if (actionType === "credit_grant") {
      const amount = Number(creditAmount) || 1;
      await grantCredits(lead.session_id, lead.user_id, "agent_grant", amount);
    }

    // 3. If status is provided, update lead status
    if (status) {
      await supabaseAdmin
        .from("leads")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", leadId);
    }

    // 4. Log agent action in agent_actions table
    const { data: actionRecord, error: actionErr } = await supabaseAdmin
      .from("agent_actions")
      .insert({
        lead_id: leadId,
        action_type: actionType,
        notes: notes || null,
        credit_amount: actionType === "credit_grant" ? Number(creditAmount) || 1 : null,
      })
      .select()
      .single();

    if (actionErr) {
      console.error("[/api/admin/leads/action] Log error:", actionErr.message);
      return NextResponse.json({ error: "Failed to record action." }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: actionRecord });
  } catch (err) {
    console.error("[/api/admin/leads/action] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
