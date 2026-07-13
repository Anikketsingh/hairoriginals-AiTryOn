/**
 * lib/analytics.ts
 *
 * Server-only helper for funnel analytics event instrumentation. Inserts
 * directly into analytics_events. The client-side beacon that funnels through
 * the same insert (via POST /api/analytics/track) lives in
 * lib/analytics-client.ts so browser bundles don't pull in server-only code.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { getFunnelStage } from "@/lib/funnel";

/** Client-side beacon lives in lib/analytics-client.ts (browser-safe). */

/**
 * Server-side: inserts directly into `analytics_events` — for Route
 * Handlers that already have the session/user resolved and shouldn't pay
 * for a self-HTTP round trip. Used by /api/analytics/track itself so both
 * entry points share one code path.
 */
export async function recordAnalyticsEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
  sessionId: string | null = null,
  userId: string | null = null
): Promise<void> {
  try {
    const stage = sessionId || userId ? await getFunnelStage(sessionId, userId) : null;

    await supabaseAdmin.from("analytics_events").insert({
      event_name: eventName,
      session_id: sessionId,
      user_id: userId,
      funnel_stage: stage,
      properties,
    });
  } catch (err) {
    console.error("[analytics] recordAnalyticsEvent failed:", err);
  }
}
