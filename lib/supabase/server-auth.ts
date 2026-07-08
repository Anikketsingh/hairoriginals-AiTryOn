/**
 * lib/supabase/server-auth.ts
 *
 * Cookie-bound Supabase client for Route Handlers and Server Components —
 * identifies the *calling admin* from their session cookie. Distinct from
 * lib/supabase/server.ts's `supabaseAdmin` (service role, no cookies, used
 * for all data-plane queries) and lib/supabase/client.ts (plain browser
 * client used by the customer app's phone-OTP flow).
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseUrl, getSupabaseAnonKey } from "./env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component render, which can't mutate
          // cookies — safe to ignore since proxy.ts refreshes the session
          // cookie on every request.
        }
      },
    },
  });
}
