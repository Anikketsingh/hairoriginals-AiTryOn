/**
 * lib/meta-pixel.ts
 *
 * Client-side Meta (Facebook) Pixel helper. Kept separate from the server-side
 * Conversions API helper (lib/meta-capi.ts) so client components can fire pixel
 * events without pulling server-only code (node:crypto, access tokens) into the
 * browser bundle. Mirrors the split in lib/analytics-client.ts / lib/analytics.ts.
 *
 * The base pixel script (which defines window.fbq and fires PageView) is
 * injected in app/layout.tsx. These helpers just call into it.
 */

type FbqParams = Record<string, unknown>;

declare global {
  interface Window {
    fbq?: (
      method: "track" | "trackCustom" | "init",
      eventName: string,
      params?: FbqParams,
      options?: { eventID?: string }
    ) => void;
  }
}

/** Standard Meta events fire with `track`; anything else is a custom event. */
const STANDARD_EVENTS = new Set([
  "PageView",
  "ViewContent",
  "Search",
  "AddToCart",
  "AddToWishlist",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  "Lead",
  "CompleteRegistration",
  "Schedule",
  "Contact",
  "Subscribe",
]);

/**
 * Fire a Meta Pixel event from the browser. Never throws — if the pixel hasn't
 * loaded (e.g. NEXT_PUBLIC_META_PIXEL_ID unset), it's a silent no-op.
 *
 * Pass `eventId` to deduplicate against a matching server-side Conversions API
 * event (see lib/meta-capi.ts) — Meta counts events sharing an event_id once.
 */
export function trackPixelEvent(
  eventName: string,
  params: FbqParams = {},
  eventId?: string
): void {
  try {
    if (typeof window === "undefined" || typeof window.fbq !== "function") return;
    const method = STANDARD_EVENTS.has(eventName) ? "track" : "trackCustom";
    window.fbq(method, eventName, params, eventId ? { eventID: eventId } : undefined);
  } catch (err) {
    console.error("[meta-pixel] trackPixelEvent failed:", err);
  }
}

/**
 * Generate a unique event id to pair a browser pixel event with its server-side
 * Conversions API twin for deduplication. Generate it once on the client, send
 * it to the API route in the request body, and pass the same value to both
 * `trackPixelEvent(..., eventId)` and the server `sendCapiEvent`.
 */
export function newPixelEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
