/**
 * lib/supabase/public-url.ts
 *
 * Storage URLs (getPublicUrl/createSignedUrl) are built from the server's
 * internal SUPABASE_URL (e.g. http://127.0.0.1:54321), which only resolves
 * on the machine running Next.js — not from a phone or any other device.
 * Routes that hand a storage URL to the browser must rewrite its origin to
 * NEXT_PUBLIC_SUPABASE_URL (the address the browser can actually reach)
 * before returning it. The path/query (bucket, object path, signed-url
 * token) is untouched.
 */

import { getSupabaseUrl } from "./env";

// Mirrors the fallback in lib/supabase/server.ts's resolveSupabaseUrl — kept
// as a plain constant here (rather than importing supabaseAdmin) so this
// util doesn't trigger admin-client instantiation just by being imported.
const DEFAULT_LOCAL_URL = "http://127.0.0.1:54321";

export function toPublicStorageUrl(url: string): string;
export function toPublicStorageUrl(url: string | null | undefined): string | null;
export function toPublicStorageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const internalOrigin = new URL(process.env.SUPABASE_URL || DEFAULT_LOCAL_URL).origin;

    // Only rewrite URLs that actually came from our own Supabase Storage —
    // product image_url can also be an arbitrary external URL (e.g. an
    // Unsplash placeholder), which must be left untouched.
    if (parsed.origin !== internalOrigin) return url;

    const publicBase = new URL(getSupabaseUrl());
    return `${publicBase.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}
