/**
 * POST /api/leads
 *
 * Creates a CRM lead record. Called when:
 *   - Stage 3 agent gate is hit (auto-triggered from /api/generate)
 *   - User clicks "Talk to a Stylist" at any stage (voluntary)
 *
 * Body (JSON): { sessionToken: string, source?: 'agent_gate' | 'talk_to_expert' }
 * Returns: { leadId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionByToken, getFunnelStage } from "@/lib/funnel";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { dispatchIntegrationEvent } from "@/lib/event-bus";
import { parseJsonBody } from "@/lib/validate";
import { maintenanceGuard } from "@/lib/maintenance";
import { readAttributionCookie } from "@/lib/attribution";

const bodySchema = z.object({
  sessionToken: z.string().min(1, "Missing sessionToken."),
  source: z.enum(["agent_gate", "talk_to_expert"]).optional().default("agent_gate"),
});

export async function POST(request: NextRequest) {
  try {
    const closed = await maintenanceGuard(request);
    if (closed) return closed;

    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { sessionToken, source } = parsed.data;

    const session = await getSessionByToken(sessionToken);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    // Check if a lead already exists for this session/user to avoid duplicates
    const existingFilter = session.user_id
      ? { user_id: session.user_id }
      : { session_id: session.id };

    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("id, status")
      .match(existingFilter)
      .limit(1);

    if (existing && existing.length > 0) {
      // Lead already exists — return the existing one (idempotent)
      return NextResponse.json({ leadId: existing[0].id, existing: true });
    }

    // Count generations used by this session/user
    const { count: genCount } = await supabaseAdmin
      .from("generations")
      .select("id", { count: "exact", head: true })
      .or(
        session.user_id
          ? `user_id.eq.${session.user_id},session_id.eq.${session.id}`
          : `session_id.eq.${session.id}`
      )
      .eq("status", "completed");

    // Get phone from user record if logged in
    let phone: string | null = null;
    if (session.user_id) {
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("phone")
        .eq("id", session.user_id)
        .single();
      phone = user?.phone ?? null;
    }

    const stage = await getFunnelStage(session.id, session.user_id);

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .insert({
        user_id: session.user_id ?? null,
        session_id: session.id,
        phone,
        funnel_stage_at_creation: stage,
        generations_count: genCount ?? 0,
        source,
      })
      .select("id")
      .single();

    if (leadError || !lead) {
      console.error("[/api/leads] Insert error:", leadError?.message);
      return NextResponse.json({ error: "Failed to create lead." }, { status: 500 });
    }

    await dispatchIntegrationEvent(
      "lead.created",
      {
        leadId: lead.id,
        userId: session.user_id,
        sessionId: session.id,
        phone,
        source,
        attribution: readAttributionCookie(request),
        generationsCount: genCount ?? 0,
      },
      "crm"
    );
    await recordAnalyticsEvent("lead_created", { source }, session.id, session.user_id);

    return NextResponse.json({ leadId: lead.id }, { status: 201 });
  } catch (err) {
    console.error("[/api/leads] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
