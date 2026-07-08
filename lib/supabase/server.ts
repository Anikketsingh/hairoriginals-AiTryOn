/**
 * lib/supabase/server.ts
 *
 * Server-only Supabase client using the service-role key. In production, a
 * missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY throws at module load
 * (fail fast) instead of silently falling back to a local demo key that
 * would make every query fail against nothing.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_LOCAL_URL = "http://127.0.0.1:54321";
const DEFAULT_LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const isProd = process.env.NODE_ENV === "production";

function resolveSupabaseUrl(): string {
  const value = process.env.SUPABASE_URL;
  if (isProd && !value) {
    throw new Error("SUPABASE_URL is required in production.");
  }
  return value || DEFAULT_LOCAL_URL;
}

function resolveServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (isProd && !value) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required in production.");
  }
  return value || DEFAULT_LOCAL_SERVICE_KEY;
}

let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(resolveSupabaseUrl(), resolveServiceRoleKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _adminClient;
}

export const supabaseAdmin = getSupabaseAdmin();
