/**
 * lib/analytics.ts
 *
 * Client & Server helpers for funnel analytics event instrumentation.
 * Both funnel through the same analytics_events insert (see
 * recordAnalyticsEvent) so the shape stored is identical regardless of
 * whether the event originated in a Route Handler (server, has direct DB
 * access) or a client component (browser, must go through the API route).
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { getFunnelStage } from "@/lib/funnel";

/** Client-side: fires a `POST /api/analytics/track` beacon. Never throws. */
export async function trackAnalyticsEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
  sessionToken?: string | null
): Promise<void> {
  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName, properties, sessionToken }),
    });
  } catch (err) {
    console.error("[analytics] Event tracking failed:", err);
  }
}

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
