/**
 * lib/app-url.ts
 *
 * Resolves the app's public base origin for building absolute URLs that
 * external systems fetch (e.g. the stable CRM media proxy handed to Digicuro).
 * Prefer an explicit APP_BASE_URL (the custom domain); fall back to Vercel's
 * per-deployment host, then localhost for dev.
 */

/** Public origin of this app, no trailing slash. */
export function getAppBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
