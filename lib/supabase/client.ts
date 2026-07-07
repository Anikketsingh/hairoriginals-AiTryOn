/**
 * lib/supabase/client.ts
 *
 * Browser-side Supabase client — use ONLY for Supabase Auth calls.
 */

import { createClient } from "@supabase/supabase-js";

const DEFAULT_LOCAL_URL = "http://127.0.0.1:54321";
const DEFAULT_LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_LOCAL_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_LOCAL_ANON_KEY;

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
