/**
 * lib/analytics.ts
 *
 * Client & Server helper for funnel analytics event instrumentation.
 */

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
