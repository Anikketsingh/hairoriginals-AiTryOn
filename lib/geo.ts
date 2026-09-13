/**
 * lib/geo.ts
 *
 * Decides which country the phone gate should default to, from the request
 * signals the server layout can see.
 *
 * Kept out of lib/phone.ts deliberately. That module owns phone *policy* —
 * which markets we sell to, whether a number is dialable — and is the client
 * half of the pair whose server half is supabase/functions/send-sms/routing.ts.
 * "Which header names the visitor's country" is plumbing, not policy. Keeping
 * it here also leaves this module dependency-free, so it is testable under
 * plain Node, and the server layout doesn't pull in libphonenumber's mobile
 * metadata just to read two letters.
 */

/** Query parameter that stands in for the geo header in development. */
export const DEV_GEO_PARAM = "geo";

const ISO_3166_ALPHA2 = /^[a-z]{2}$/i;

/**
 * Resolves the country used to seed the picker, honouring a dev-only override.
 *
 * `x-vercel-ip-country` is injected by Vercel's edge and exists nowhere else,
 * so under `next dev` it is always null and every local visitor looks Indian.
 * That made the geo default impossible to exercise without deploying, which is
 * the entire reason a working feature kept reading as broken. The override
 * exists to close that gap and nothing else.
 *
 * `allowOverride` defaults to "not production" so every call site is safe
 * without restating the guard, but stays a parameter so tests can pin the
 * production branch without mutating NODE_ENV for the whole process.
 *
 * Validates SHAPE ONLY, never against SUPPORTED_COUNTRIES. resolveDefaultCountry()
 * already maps anything we don't offer back to the default, so `?geo=JP`
 * degrades to India for free — a second allowlist here would only be a copy
 * that could drift from the first.
 *
 * A malformed override falls THROUGH to the real header rather than becoming
 * the answer. Swallowing `?geo=UAS` into a null would pin the picker to the
 * fallback and look exactly like the bug this is meant to diagnose.
 */
export function resolveGeoCountry(
  ipCountry: string | null | undefined,
  override: string | null | undefined,
  allowOverride: boolean = process.env.NODE_ENV !== "production",
): string | null {
  if (allowOverride && override && ISO_3166_ALPHA2.test(override)) {
    return override.toUpperCase();
  }
  return ipCountry ?? null;
}
