/**
 * lib/meta-capi.ts
 *
 * Server-only Meta Conversions API (CAPI) helper. Sends conversion events to
 * Meta directly from our backend so they survive ad-blockers / iOS tracking
 * restrictions that drop the browser pixel. Each server event carries the same
 * `event_id` as its browser-pixel twin (lib/meta-pixel.ts) so Meta counts the
 * action once (deduplication).
 *
 * Fail-open: if the pixel id or access token is unset, this is a silent no-op —
 * safe to ship before the credentials exist (mirrors lib/rate-limit.ts).
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import { createHash } from "node:crypto";

const GRAPH_API_VERSION = "v21.0";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
// Optional: set while validating in Events Manager → Test Events; blank in prod.
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || undefined;

/** User-identifying signals used for match quality. Hashed here where required. */
export interface CapiUserData {
  /** Raw email — lowercased/trimmed then SHA-256 hashed before sending. */
  email?: string | null;
  /** Raw phone — reduced to digits (E.164 without '+') then SHA-256 hashed. */
  phone?: string | null;
  /** Sent unhashed per Meta's spec. */
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  /** The `_fbp` / `_fbc` browser cookies, sent unhashed. Improve match rate. */
  fbp?: string | null;
  fbc?: string | null;
}

export interface SendCapiEventArgs {
  /** e.g. "CompleteRegistration", "Lead", "Purchase", or a custom event name. */
  eventName: string;
  /** Shared with the browser pixel event for dedup. Strongly recommended. */
  eventId?: string;
  /** The page URL the action happened on. */
  eventSourceUrl?: string | null;
  userData: CapiUserData;
  customData?: Record<string, unknown>;
  /** Defaults to now. */
  eventTimeMs?: number;
}

/** SHA-256 hex of a normalized string, or undefined if there's nothing to hash. */
function hash(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return createHash("sha256").update(normalized).digest("hex");
}

/** Reduce a phone number to digits only (Meta wants E.164 without the '+'). */
function normalizePhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  return digits || undefined;
}

/**
 * Send a single conversion event to Meta's Conversions API. Never throws.
 * Intended to be called via `after(...)` from a Route Handler so it doesn't
 * delay the user-facing response.
 */
export async function sendCapiEvent(args: SendCapiEventArgs): Promise<void> {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn(
      "[meta-capi] NEXT_PUBLIC_META_PIXEL_ID or META_CAPI_ACCESS_TOKEN unset — skipping CAPI event."
    );
    return;
  }

  try {
    const { userData } = args;

    const em = hash(userData.email);
    const ph = hash(normalizePhone(userData.phone));

    const user_data: Record<string, unknown> = {};
    if (em) user_data.em = [em];
    if (ph) user_data.ph = [ph];
    if (userData.clientIpAddress) user_data.client_ip_address = userData.clientIpAddress;
    if (userData.clientUserAgent) user_data.client_user_agent = userData.clientUserAgent;
    if (userData.fbp) user_data.fbp = userData.fbp;
    if (userData.fbc) user_data.fbc = userData.fbc;

    const body: Record<string, unknown> = {
      data: [
        {
          event_name: args.eventName,
          event_time: Math.floor((args.eventTimeMs ?? Date.now()) / 1000),
          event_id: args.eventId,
          event_source_url: args.eventSourceUrl ?? undefined,
          action_source: "website",
          user_data,
          custom_data: args.customData,
        },
      ],
    };
    if (TEST_EVENT_CODE) body.test_event_code = TEST_EVENT_CODE;

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(
      ACCESS_TOKEN
    )}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[meta-capi] ${args.eventName} failed (${res.status}): ${detail}`);
    }
  } catch (err) {
    console.error("[meta-capi] sendCapiEvent failed:", err);
  }
}
