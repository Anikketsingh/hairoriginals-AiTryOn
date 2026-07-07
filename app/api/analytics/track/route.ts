/**
 * POST /api/analytics/track
 *
 * Persists analytics events in `analytics_events`.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionByToken, getFunnelStage } from "@/lib/funnel";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventName, properties, sessionToken } = body;

    if (!eventName) {
      return NextResponse.json({ error: "Missing eventName." }, { status: 400 });
    }

    let sessionId: string | null = null;
    let userId: string | null = null;
    let stage: number | null = null;

    if (sessionToken) {
      const session = await getSessionByToken(sessionToken);
      if (session) {
        sessionId = session.id;
        userId = session.user_id;
        stage = await getFunnelStage(sessionId, userId);
      }
    }

    await supabaseAdmin.from("analytics_events").insert({
      event_name: eventName,
      session_id: sessionId,
      user_id: userId,
      funnel_stage: stage,
      properties: properties || {},
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/analytics/track] Error:", err);
    return NextResponse.json({ error: "Failed to record analytics event." }, { status: 500 });
  }
}
