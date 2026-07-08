/**
 * lib/supabase/admin-browser-client.ts
 *
 * Cookie-based browser Supabase client for the admin login page ONLY. Uses
 * @supabase/ssr's createBrowserClient (not the plain createClient in
 * lib/supabase/client.ts) so the session persists in cookies that proxy.ts
 * and lib/admin-auth.ts can read server-side. The customer app's phone-OTP
 * flow intentionally stays on the separate localStorage-based client in
 * lib/supabase/client.ts — do not merge these two.
 */

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseUrl, getSupabaseAnonKey } from "./env";

export const supabaseAdminBrowserClient = createBrowserClient(
  getSupabaseUrl(),
  getSupabaseAnonKey()
);
