/**
 * lib/consent.ts
 *
 * Where non-essential tracking needs prior opt-in, and how that decision is
 * stored.
 *
 * Background: the Meta Pixel previously loaded and fired PageView on every page
 * for every visitor, before any consent. In the EEA/UK that breaches the
 * ePrivacy Directive the moment the page loads — consent must come *before* the
 * script, not after.
 *
 * Region detection uses the browser's IANA timezone rather than a geo-IP
 * lookup. That keeps the root layout static (reading request headers would make
 * every route dynamic) and costs nothing. It is not perfect — a VPN or a
 * traveller can defeat it — so `UNKNOWN_REQUIRES_CONSENT` decides which way to
 * err when the timezone is unreadable.
 *
 * To switch to opt-in everywhere (simplest to defend legally, at some cost to
 * conversion in markets that don't require it), make isConsentRequired() return
 * true unconditionally.
 */

/** Timezone prefixes whose regions require prior opt-in for non-essential cookies. */
const CONSENT_REQUIRED_TZ_PREFIXES = ["Europe/", "Atlantic/Canary", "Atlantic/Madeira", "Atlantic/Azores"];

/**
 * Europe/* timezones that are NOT in the EEA/UK/CH. Listed explicitly so the
 * prefix match above doesn't over-apply. Being on this list only means the
 * banner isn't legally mandated there — tracking is still disclosed in the
 * privacy policy.
 */
const NON_EEA_EUROPE_TZ = new Set([
  "Europe/Moscow",
  "Europe/Samara",
  "Europe/Volgograd",
  "Europe/Saratov",
  "Europe/Ulyanovsk",
  "Europe/Kirov",
  "Europe/Astrakhan",
  "Europe/Minsk",
  "Europe/Istanbul",
]);

/** Err toward showing the banner when we can't tell where the visitor is. */
const UNKNOWN_REQUIRES_CONSENT = false;

export const CONSENT_STORAGE_KEY = "ho_consent_v1";

export type ConsentValue = "granted" | "denied";

/** Whether this visitor must actively opt in before analytics/marketing loads. */
export function isConsentRequired(): boolean {
  if (typeof Intl === "undefined") return UNKNOWN_REQUIRES_CONSENT;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return UNKNOWN_REQUIRES_CONSENT;
    if (NON_EEA_EUROPE_TZ.has(tz)) return false;
    return CONSENT_REQUIRED_TZ_PREFIXES.some((prefix) => tz.startsWith(prefix));
  } catch {
    return UNKNOWN_REQUIRES_CONSENT;
  }
}

export function readStoredConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    // Storage blocked (private mode, embedded webview) — treat as undecided.
    return null;
  }
}

export function storeConsent(value: ConsentValue): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    // Non-fatal: the choice just won't persist across sessions.
  }
}
