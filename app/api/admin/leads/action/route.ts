/**
 * POST /api/admin/leads/action
 *
 * Records sales agent actions (notes, calls, status changes, credit grants).
 * Body: { leadId: string, actionType: 'note' | 'call' | 'credit_grant' | 'status_change', notes?: string, status?: string, creditAmount?: number }
 *
 * sales_agent may only act on their own leads or unassigned leads — acting on
 * an unassigned lead claims it (context.md §5.1 scoping).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/funnel";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const bodySchema = z.object({
  leadId: z.string().uuid("leadId must be a valid ID."),
  actionType: z.enum(["note", "call", "credit_grant", "status_change"]),
  notes: z.string().max(4000).optional(),
  status: z.string().max(50).optional(),
  creditAmount: z.number().positive().optional(),
});

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "sales_agent"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { leadId, actionType, notes, status, creditAmount } = parsed.data;

    // 1. Get lead details to resolve owner (user_id / session_id) and enforce scoping
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, user_id, session_id, assigned_agent_id")
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    if (
      admin.role === "sales_agent" &&
      lead.assigned_agent_id &&
      lead.assigned_agent_id !== admin.id
    ) {
      return NextResponse.json(
        { error: "This lead is assigned to another agent." },
        { status: 403 }
      );
    }

    // Claim an unassigned lead on first touch by a sales agent.
    if (admin.role === "sales_agent" && !lead.assigned_agent_id) {
      await supabaseAdmin
        .from("leads")
        .update({ assigned_agent_id: admin.id })
        .eq("id", leadId);
    }

    // 2. If actionType is credit_grant (Stage 4 grant by agent)
    if (actionType === "credit_grant") {
      const amount = Number(creditAmount) || 1;
      await grantCredits(lead.session_id, lead.user_id, "agent_grant", amount, admin.id);
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
        agent_id: admin.id,
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
