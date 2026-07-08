/**
 * lib/supabase/client.ts
 *
 * Browser-side Supabase client — use ONLY for Supabase Auth calls (the
 * customer app's phone-OTP flow). Plain createClient with a localStorage
 * session, distinct from admin-browser-client.ts's cookie-based client
 * (which proxy.ts and the admin DAL need to read server-side).
 */

import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getSupabaseAnonKey } from "./env";

export const supabaseClient = createClient(getSupabaseUrl(), getSupabaseAnonKey());
