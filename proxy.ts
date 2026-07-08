/**
 * proxy.ts
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (the `middleware` file
 * convention is deprecated). This performs the optimistic gate for the admin
 * surface: if there's no valid Supabase Auth session at all, block/redirect
 * immediately, before the request reaches any admin page or API route.
 *
 * This is deliberately NOT the full authorization check — per Next.js's own
 * guidance, proxy should avoid slow data fetching (DB calls) and isn't a
 * complete session/authorization solution on its own. Role-based checks
 * against `admin_users` happen authoritatively in lib/admin-auth.ts,
 * called from each admin Route Handler.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseProxyClient } from "@/lib/supabase/proxy";

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/api/admin/bootstrap"];

function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAdminPath(pathname)) {
    return NextResponse.next();
  }

  const { supabase, response } = createSupabaseProxyClient(request);
  const { data: userData } = await supabase.auth.getUser();

  if (!userData?.user) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
