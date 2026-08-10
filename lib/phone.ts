/**
 * lib/phone.ts
 *
 * Phone number normalization and validation, shared by the client gate
 * (components/FunnelGate.tsx) and any server route that needs to reason about
 * a number.
 *
 * Two distinct concerns live here, and they are not the same check:
 *
 *   1. VALIDITY — "is this a real, dialable mobile number?" Answered by
 *      libphonenumber-js. Uses the `/mobile` metadata subset so landlines are
 *      rejected: an SMS to a landline is a wasted send that still bills.
 *
 *   2. POLICY — "do we serve this country?" Answered by SUPPORTED_COUNTRIES.
 *      A Jamaican mobile is perfectly valid but we don't sell there, and +1
 *      Caribbean ranges are a common SMS-pumping vector.
 *
 * This module is UX only. The authoritative enforcement is server-side in
 * supabase/functions/send-sms/routing.ts, which re-checks the country against
 * SMS_ALLOWED_COUNTRIES before calling a provider. Keep the two lists in sync —
 * this one drives the picker, that one controls spend.
 */

import { isValidPhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js/mobile";
import type { CountryCode } from "libphonenumber-js";

export interface SupportedCountry {
  /** ISO 3166-1 alpha-2. */
  iso: CountryCode;
  /** E.164 calling code, with the leading +. */
  dial: string;
  name: string;
  flag: string;
}

/**
 * Markets we send OTPs to, in picker order (largest first, then alphabetical).
 *
 * MUST stay in sync with:
 *   - SMS_ALLOWED_COUNTRIES  (supabase edge function secret — enforcement)
 *   - Twilio Console → Messaging → Geo Permissions  (vendor-level cap)
 *
 * Adding a country here without adding it to both of those produces a picker
 * option that always fails at send time.
 */
const ALL_COUNTRIES: readonly SupportedCountry[] = [
  { iso: "IN", dial: "+91", name: "India", flag: "🇮🇳" },
  { iso: "US", dial: "+1", name: "United States", flag: "🇺🇸" },
  { iso: "CA", dial: "+1", name: "Canada", flag: "🇨🇦" },
  { iso: "GB", dial: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { iso: "AE", dial: "+971", name: "United Arab Emirates", flag: "🇦🇪" },
  { iso: "SG", dial: "+65", name: "Singapore", flag: "🇸🇬" },
  { iso: "DE", dial: "+49", name: "Germany", flag: "🇩🇪" },
  { iso: "ES", dial: "+34", name: "Spain", flag: "🇪🇸" },
  { iso: "FR", dial: "+33", name: "France", flag: "🇫🇷" },
  { iso: "ID", dial: "+62", name: "Indonesia", flag: "🇮🇩" },
  { iso: "IE", dial: "+353", name: "Ireland", flag: "🇮🇪" },
  { iso: "IT", dial: "+39", name: "Italy", flag: "🇮🇹" },
  { iso: "MY", dial: "+60", name: "Malaysia", flag: "🇲🇾" },
  { iso: "NL", dial: "+31", name: "Netherlands", flag: "🇳🇱" },
  { iso: "SA", dial: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { iso: "SE", dial: "+46", name: "Sweden", flag: "🇸🇪" },
] as const;

/**
 * Countries actually offered in the picker.
 *
 * Filtered by NEXT_PUBLIC_SMS_ALLOWED_COUNTRIES so the UI can never offer a
 * country the server will reject. This matters during rollout: Twilio's 10DLC
 * and UAE sender-ID registrations take weeks, so until they clear the allowlist
 * is just "IN" — and showing a UK option that always errors would be worse
 * than not showing it.
 *
 * Set it to the same value as the server-side SMS_ALLOWED_COUNTRIES. Unset
 * means "offer everything we support", which is the end state once all the
 * carrier registrations are done.
 */
const ALLOWED_ISO_ENV = process.env.NEXT_PUBLIC_SMS_ALLOWED_COUNTRIES?.trim();

export const SUPPORTED_COUNTRIES: readonly SupportedCountry[] = (() => {
  if (!ALLOWED_ISO_ENV) return ALL_COUNTRIES;
  const allowed = new Set(
    ALLOWED_ISO_ENV.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
  );
  const filtered = ALL_COUNTRIES.filter((c) => allowed.has(c.iso));
  // Never render an empty picker — a typo'd env var shouldn't make sign-in
  // impossible. Fall back to the full list and let the server reject.
  return filtered.length > 0 ? filtered : ALL_COUNTRIES;
})();

export const DEFAULT_COUNTRY: CountryCode = "IN";

const SUPPORTED_ISO = new Set<string>(SUPPORTED_COUNTRIES.map((c) => c.iso));

export function isSupportedCountry(iso: string | null | undefined): iso is CountryCode {
  return !!iso && SUPPORTED_ISO.has(iso.toUpperCase());
}

/**
 * Picks the initial country for the phone input.
 *
 * Vercel sets `x-vercel-ip-country` on every request at no cost, so geo comes
 * free — no third-party lookup. Falls back to India, which was previously
 * hardcoded for every visitor regardless of location.
 */
export function resolveDefaultCountry(ipCountry: string | null | undefined): CountryCode {
  const iso = ipCountry?.toUpperCase();
  if (isSupportedCountry(iso)) return iso;
  // India unless it's been filtered out of the picker, in which case fall to
  // the first offered country — the select must always have a matching option.
  return isSupportedCountry(DEFAULT_COUNTRY)
    ? DEFAULT_COUNTRY
    : (SUPPORTED_COUNTRIES[0].iso as CountryCode);
}

export function countryByIso(iso: CountryCode): SupportedCountry | undefined {
  return SUPPORTED_COUNTRIES.find((c) => c.iso === iso);
}

export type PhoneValidation =
  | { ok: true; e164: string }
  | { ok: false; reason: "empty" | "unsupported_country" | "invalid" };

/**
 * Normalizes a national number + country into E.164, validating as it goes.
 *
 * Returns E.164 with no spaces or punctuation — the exact format Supabase Auth
 * expects and the format the send-sms hook forwards to Twilio unmodified.
 */
export function validatePhone(nationalNumber: string, country: CountryCode): PhoneValidation {
  const digits = nationalNumber.replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "empty" };
  if (!isSupportedCountry(country)) return { ok: false, reason: "unsupported_country" };

  const parsed = parsePhoneNumberFromString(digits, country);
  if (!parsed || !isValidPhoneNumber(parsed.number, country)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, e164: parsed.number };
}

/** Convenience predicate for disabling a submit button as the user types. */
export function isValidMobile(nationalNumber: string, country: CountryCode): boolean {
  return validatePhone(nationalNumber, country).ok;
}

/** User-facing copy for a failed validation. */
export function validationMessage(reason: Exclude<PhoneValidation, { ok: true }>["reason"]): string {
  switch (reason) {
    case "empty":
      return "Please enter your phone number.";
    case "unsupported_country":
      return "We can't send codes to that country yet.";
    case "invalid":
      return "That doesn't look like a valid mobile number.";
  }
}
