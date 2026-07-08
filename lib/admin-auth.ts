/**
 * lib/admin-auth.ts
 *
 * Data Access Layer for admin authorization. Root proxy.ts only performs an
 * optimistic "is there a Supabase session at all" check (Next.js's own
 * guidance: proxy should avoid DB calls and isn't a full authorization
 * solution). This module is the authoritative check — it re-verifies the
 * session and looks up the caller's row/role in `admin_users` via the
 * service-role client. Call `requireAdmin()` at the top of every admin Route
 * Handler.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";

export type AdminRole = "super_admin" | "content_manager" | "sales_agent";

export interface AdminContext {
  id: string;
  authId: string;
  email: string;
  name: string;
  role: AdminRole;
}

const ALL_ROLES: AdminRole[] = ["super_admin", "content_manager", "sales_agent"];

/** Resolves the calling admin from their session cookie, or null if not a valid active admin. */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData?.user) return null;

  const { data: admin, error: adminErr } = await supabaseAdmin
    .from("admin_users")
    .select("id, auth_id, email, name, role, status")
    .eq("auth_id", userData.user.id)
    .single();

  if (adminErr || !admin || admin.status !== "active") return null;

  return {
    id: admin.id,
    authId: admin.auth_id,
    email: admin.email,
    name: admin.name,
    role: admin.role as AdminRole,
  };
}

/**
 * Call at the top of every admin Route Handler:
 *
 *   const admin = await requireAdmin(["super_admin"]);
 *   if (admin instanceof NextResponse) return admin;
 *
 * Returns the AdminContext on success, or a NextResponse (401/403) to return
 * directly on failure.
 */
export async function requireAdmin(
  allowedRoles: AdminRole[] = ALL_ROLES
): Promise<AdminContext | NextResponse> {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!allowedRoles.includes(admin.role)) {
    return NextResponse.json(
      { error: "Forbidden — insufficient role" },
      { status: 403 }
    );
  }
  return admin;
}

/**
 * Cost/credit data is super_admin-only by default, per context.md §5.1 —
 * content_manager only sees it if the `content_manager_can_see_costs`
 * setting (Admin → AI Configuration) has been turned on. sales_agent never
 * has cost visibility.
 */
export async function requireCostsAccess(): Promise<AdminContext | NextResponse> {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (admin.role === "super_admin") return admin;
  if (admin.role === "content_manager") {
    const allowed = (await getSetting("content_manager_can_see_costs")) as boolean;
    if (allowed) return admin;
  }
  return NextResponse.json(
    { error: "Forbidden — insufficient role" },
    { status: 403 }
  );
}
