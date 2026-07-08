/**
 * lib/supabase/env.ts
 *
 * Centralizes Supabase URL/anon-key env resolution so the local-demo-key
 * fallback lives in one place instead of being copy-pasted per client file.
 * In production, a missing var throws immediately (fail fast) instead of
 * silently falling back to a demo key that points at nothing real.
 */

const DEFAULT_LOCAL_URL = "http://127.0.0.1:54321";
const DEFAULT_LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const isProd = process.env.NODE_ENV === "production";

export function getSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (isProd && !value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required in production.");
  }
  return value || DEFAULT_LOCAL_URL;
}

export function getSupabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (isProd && !value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required in production.");
  }
  return value || DEFAULT_LOCAL_ANON_KEY;
}
