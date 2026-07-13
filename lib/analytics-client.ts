/**
 * lib/analytics-client.ts
 *
 * Client-side analytics helper. Kept separate from lib/analytics.ts so client
 * components can fire analytics beacons without pulling server-only code
 * (supabaseAdmin, funnel/event-bus, next/server `after`) into the browser
 * bundle. Server code should import recordAnalyticsEvent from lib/analytics.ts.
 */

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
