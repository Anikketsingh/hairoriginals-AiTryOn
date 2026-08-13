/**
 * GET / POST /api/customer/feedback
 *
 * Post-trial customer feedback. Submitted from the try-on result screen after
 * a logged-in customer's first look, and attached to their CRM lead so a sales
 * agent sees it (both as a dedicated panel and as a lead-timeline entry).
 *
 *   GET  ?sessionToken=…  → { submitted: boolean }  (has this owner given feedback?)
 *   POST { sessionToken, rating, improvement?, interest?, generationId?, productId? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionByToken } from "@/lib/funnel";
import { ensureLeadForSession } from "@/lib/leads";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { parseJsonBody } from "@/lib/validate";
import { maintenanceGuard } from "@/lib/maintenance";

const feedbackBodySchema = z.object({
  sessionToken: z.string().min(1, "Missing sessionToken."),
  rating: z.number().int().min(1, "rating must be 1-4.").max(4, "rating must be 1-4."),
  improvement: z.string().max(1000).optional(),
  interest: z.enum(["yes", "maybe", "browsing"]).optional(),
  generationId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
});

/** OR filter matching feedback owned by this session or user. */
function ownerFilter(sessionId: string, userId: string | null): string {
  return userId ? `user_id.eq.${userId},session_id.eq.${sessionId}` : `session_id.eq.${sessionId}`;
}

export async function GET(request: NextRequest) {
  try {
    const closed = await maintenanceGuard(request);
    if (closed) return closed;

    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get("sessionToken");

    if (!sessionToken) {
      return NextResponse.json({ error: "Missing sessionToken." }, { status: 400 });
    }

    const session = await getSessionByToken(sessionToken);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from("customer_feedback")
      .select("id")
      .or(ownerFilter(session.id, session.user_id))
      .limit(1);

    if (error) {
      return NextResponse.json({ error: "Failed to check feedback." }, { status: 500 });
    }

    return NextResponse.json({ submitted: (data ?? []).length > 0 });
  } catch (err) {
    console.error("[/api/customer/feedback GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const closed = await maintenanceGuard(request);
    if (closed) return closed;

    const parsed = await parseJsonBody(request, feedbackBodySchema);
    if (parsed.error) return parsed.error;
    const { sessionToken, rating, improvement, interest, generationId, productId } = parsed.data;

    const session = await getSessionByToken(sessionToken);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

    // A lead already exists from registration; ensure defensively and get its id.
    const { leadId } = await ensureLeadForSession({
      sessionId: session.id,
      userId: session.user_id,
      source: "registration",
      funnelStage: 2,
    });

    const { data: feedback, error } = await supabaseAdmin
      .from("customer_feedback")
      .insert({
        lead_id: leadId,
        user_id: session.user_id,
        session_id: session.id,
        generation_id: generationId ?? null,
        product_id: productId ?? null,
        experience_rating: rating,
        improvement: improvement?.trim() || null,
        interest: interest ?? null,
      })
      .select("id")
      .single();

    if (error || !feedback) {
      console.error("[/api/customer/feedback POST] Insert error:", error?.message);
      return NextResponse.json({ error: "Failed to save feedback." }, { status: 500 });
    }

    // Best-effort: mirror a one-line summary into the lead activity timeline and
    // record analytics. Neither should fail the submission.
    if (leadId) {
      const summary = [
        `Customer feedback · Rated ${rating}/4`,
        interest ? `interested: ${interest}` : null,
        improvement?.trim() ? `“${improvement.trim()}”` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      await supabaseAdmin.from("agent_actions").insert({
        agent_id: null,
        lead_id: leadId,
        action_type: "feedback",
        notes: summary,
      });
    }

    await recordAnalyticsEvent(
      "feedback_submitted",
      { rating, interest: interest ?? null },
      session.id,
      session.user_id
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/customer/feedback POST] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
