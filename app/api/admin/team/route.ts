/**
 * GET / POST / PATCH /api/admin/team
 *
 * Manage admin accounts (the `admin_users` table + their linked Supabase Auth
 * user). super_admin-only — this is the in-app replacement for the one-time
 * /api/admin/bootstrap endpoint and for creating admins by hand in Supabase.
 *
 *   GET   — list all admins
 *   POST  — create an admin: { email, password, name, role }
 *   PATCH — update an admin: { id, role?, status? }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, type AdminRole } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const roleSchema = z.enum(["super_admin", "content_manager", "sales_agent"]);

const createSchema = z.object({
  email: z.string().email("A valid email is required."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().min(1, "Name is required."),
  role: roleSchema,
});

const updateSchema = z
  .object({
    id: z.string().uuid("A valid admin id is required."),
    role: roleSchema.optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, {
    message: "Nothing to update — provide role and/or status.",
  });

export async function GET() {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, name, role, status, auth_id, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch admins." }, { status: 500 });
    }

    // `linked` = has a Supabase Auth user and can actually log in. The seed
    // placeholder row (admin@hairoriginals.com) has no auth_id, so it can't.
    const admins = data.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role as AdminRole,
      status: a.status as "active" | "suspended",
      linked: a.auth_id !== null,
      created_at: a.created_at,
      isSelf: a.id === admin.id,
    }));

    return NextResponse.json({ admins });
  } catch (err) {
    console.error("[/api/admin/team GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, createSchema);
    if (parsed.error) return parsed.error;
    const { email, password, name, role } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Reject if an admin with this email already has a login. (An existing row
    // with no auth_id — e.g. the seed placeholder — is fine: we link it below.)
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("admin_users")
      .select("id, auth_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: "Failed to check existing admins." }, { status: 500 });
    }
    if (existing?.auth_id) {
      return NextResponse.json(
        { error: "An admin with that email already exists." },
        { status: 409 }
      );
    }

    // 1) Create the Supabase Auth user (this is what actually logs in).
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message || "Failed to create the auth user.";
      // Surface Supabase's "already registered" as a clean 409.
      const status = /already|exists|registered/i.test(msg) ? 409 : 500;
      return NextResponse.json({ error: msg }, { status });
    }

    // 2) Create/link the admin_users row. Upsert on email so an existing
    //    unlinked placeholder row gets adopted rather than colliding.
    const { data: adminRow, error: upsertErr } = await supabaseAdmin
      .from("admin_users")
      .upsert(
        { auth_id: created.user.id, email: normalizedEmail, name, role, status: "active" },
        { onConflict: "email" }
      )
      .select("id, email, name, role, status")
      .single();

    if (upsertErr || !adminRow) {
      // Roll back the orphaned auth user so a retry can succeed.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return NextResponse.json(
        { error: upsertErr?.message || "Failed to create the admin record." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      admin: { ...adminRow, linked: true, isSelf: false },
    });
  } catch (err) {
    console.error("[/api/admin/team POST] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, updateSchema);
    if (parsed.error) return parsed.error;
    const { id, role, status } = parsed.data;

    // Guard against self-lockout / self-demotion.
    if (id === admin.id) {
      return NextResponse.json(
        { error: "You can't change your own role or status." },
        { status: 400 }
      );
    }

    // Don't strip the last active super_admin (demotion or suspension).
    const removesSuperAdmin =
      (role !== undefined && role !== "super_admin") || status === "suspended";
    if (removesSuperAdmin) {
      const { data: target } = await supabaseAdmin
        .from("admin_users")
        .select("role")
        .eq("id", id)
        .maybeSingle();

      if (target?.role === "super_admin") {
        const { count } = await supabaseAdmin
          .from("admin_users")
          .select("id", { count: "exact", head: true })
          .eq("role", "super_admin")
          .eq("status", "active");

        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: "Can't remove the last active super admin." },
            { status: 400 }
          );
        }
      }
    }

    const updates: { role?: AdminRole; status?: "active" | "suspended" } = {};
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;

    const { data: updated, error } = await supabaseAdmin
      .from("admin_users")
      .update(updates)
      .eq("id", id)
      .select("id, email, name, role, status, auth_id")
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: "Failed to update the admin." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      admin: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role as AdminRole,
        status: updated.status as "active" | "suspended",
        linked: updated.auth_id !== null,
        isSelf: false,
      },
    });
  } catch (err) {
    console.error("[/api/admin/team PATCH] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
