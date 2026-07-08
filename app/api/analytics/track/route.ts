/**
 * POST /api/analytics/track
 *
 * Persists analytics events in `analytics_events`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionByToken } from "@/lib/funnel";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { parseJsonBody } from "@/lib/validate";

const bodySchema = z.object({
  eventName: z.string().min(1, "Missing eventName."),
  properties: z.record(z.string(), z.unknown()).optional(),
  sessionToken: z.string().min(1).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { eventName, properties, sessionToken } = parsed.data;

    let sessionId: string | null = null;
    let userId: string | null = null;

    if (sessionToken) {
      const session = await getSessionByToken(sessionToken);
      if (session) {
        sessionId = session.id;
        userId = session.user_id;
      }
    }

    await recordAnalyticsEvent(eventName, properties || {}, sessionId, userId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/analytics/track] Error:", err);
    return NextResponse.json({ error: "Failed to record analytics event." }, { status: 500 });
  }
}
