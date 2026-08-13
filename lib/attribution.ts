/**
 * lib/attribution.ts
 *
 * First-touch marketing attribution — how a visitor found the try-on app.
 *
 * The params only exist on the landing URL, but the lead they belong to may not
 * be created for days (a guest tries on, leaves, comes back, signs in). We store
 * nothing in our own database, so the value has to survive client-side in the
 * meantime: a first-party cookie, which the browser then replays on every
 * request to our API for free — including /api/generate, the highest-volume
 * lead path. From there it rides the existing integration_events outbox out to
 * the CRM (see lib/webhooks/crm-payload.ts).
 *
 * Isomorphic: the parse/serialize helpers run in both places, and each side has
 * its own read/write accessors. Follows the NextRequest cookie convention
 * already used in lib/device-cookie.ts (the `next/server` import is type-only,
 * so this file still bundles for the browser).
 */

import type { NextRequest, NextResponse } from "next/server";

export const ATTR_COOKIE = "ho_attr";

/** 90 days — matches Meta's click-attribution window. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

/**
 * When the stored touch carries no campaign data (a direct or organic arrival)
 * and the visitor later clicks an ad, let the ad win. Strict first-touch would
 * permanently credit anyone who ever browsed organically to "direct", making
 * every subsequent ad click invisible to the CRM. Set to false for strict
 * first-touch.
 */
const ALLOW_PAID_UPGRADE = true;

/** Query params we lift off the landing URL, in payload order. */
export const PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "campaign_id",
  "ad_id",
  "adset_id",
  "fbclid",
  "gclid",
  "ttclid",
  "msclkid",
] as const;

export type AttributionParam = (typeof PARAM_KEYS)[number];

export interface Attribution extends Partial<Record<AttributionParam, string>> {
  /** Full landing URL including query string, hash stripped. */
  landing_url?: string;
  /** Just the path portion, for grouping (e.g. "/"). */
  landing_path?: string;
  /** document.referrer at landing — "" for a direct hit, so absent here. */
  referrer?: string;
  landed_at: string;
  /**
   * True when the arrival carried at least one campaign or click identifier
   * (i.e. a tagged marketing link rather than a bare direct/organic visit).
   * Drives the upgrade rule above.
   */
  paid: boolean;
}

/** A single param value longer than this is a mistake or an attack — clamp it. */
const MAX_VALUE_LENGTH = 500;
/** Keep the serialized cookie well inside the 4 KB per-cookie browser limit. */
const MAX_COOKIE_BYTES = 3500;

function clamp(value: string): string {
  return value.slice(0, MAX_VALUE_LENGTH);
}

/**
 * Build an Attribution from a landing URL's parts. Pure — no globals — so both
 * the browser capture and the tests can call it.
 */
export function parseAttribution(search: string, referrer: string, url: string): Attribution {
  const params = new URLSearchParams(search);

  const attr: Attribution = { landed_at: new Date().toISOString(), paid: false };

  for (const key of PARAM_KEYS) {
    const raw = params.get(key);
    if (raw && raw.trim()) {
      attr[key] = clamp(raw.trim());
      attr.paid = true;
    }
  }

  // Hash carries the funnel step (see app/(customer)/page.tsx), not attribution.
  const hashIndex = url.indexOf("#");
  const cleanUrl = hashIndex === -1 ? url : url.slice(0, hashIndex);
  if (cleanUrl) attr.landing_url = clamp(cleanUrl);

  try {
    attr.landing_path = new URL(cleanUrl).pathname;
  } catch {
    // Relative or malformed URL — the full string is still useful on its own.
  }

  if (referrer && referrer.trim()) attr.referrer = clamp(referrer.trim());

  return attr;
}

/**
 * Should `next` replace what we already stored? First-touch wins, except that a
 * campaign-tagged arrival may upgrade an untagged one (see ALLOW_PAID_UPGRADE).
 */
export function shouldReplace(existing: Attribution | null, next: Attribution): boolean {
  if (!existing) return true;
  return ALLOW_PAID_UPGRADE && !existing.paid && next.paid;
}

/** Serialize for the cookie jar, or null if it can't be made to fit. */
export function serializeAttribution(attr: Attribution): string | null {
  let encoded = encodeURIComponent(JSON.stringify(attr));
  if (encoded.length <= MAX_COOKIE_BYTES) return encoded;

  // Too big for one cookie. Shed the two free-text fields — the campaign ids
  // are the part the CRM actually reports on.
  const trimmed: Attribution = { ...attr };
  delete trimmed.referrer;
  encoded = encodeURIComponent(JSON.stringify(trimmed));
  if (encoded.length <= MAX_COOKIE_BYTES) return encoded;

  delete trimmed.landing_url;
  encoded = encodeURIComponent(JSON.stringify(trimmed));
  return encoded.length <= MAX_COOKIE_BYTES ? encoded : null;
}

/** Parse a raw cookie value. Never throws — a corrupt cookie reads as absent. */
export function deserializeAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Attribution;
  } catch {
    return null;
  }
}

// ── server ──────────────────────────────────────────────────────────────────

/** First-touch attribution for this request, or null if the visitor has none. */
export function readAttributionCookie(request: NextRequest): Attribution | null {
  return deserializeAttribution(request.cookies.get(ATTR_COOKIE)?.value);
}

/**
 * Not used today — the browser writes this cookie, because document.referrer is
 * only available there. Kept as the counterpart to lib/device-cookie.ts for the
 * day a server-side capture point (proxy.ts) is added.
 */
export function setAttributionCookie(response: NextResponse, attr: Attribution): void {
  const value = serializeAttribution(attr);
  if (!value) return;
  response.cookies.set(ATTR_COOKIE, value, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

// ── browser ─────────────────────────────────────────────────────────────────

export function readClientAttribution(): Attribution | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${ATTR_COOKIE}=([^;]*)`));
  return deserializeAttribution(match?.[1]);
}

/**
 * Not httpOnly: this is written by page JS (document.referrer has no server-side
 * equivalent we trust), and it is marketing provenance rather than a credential
 * — nothing is authorized on the strength of it.
 */
export function writeClientAttribution(attr: Attribution): void {
  if (typeof document === "undefined") return;
  const value = serializeAttribution(attr);
  if (!value) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ATTR_COOKIE}=${value}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}
