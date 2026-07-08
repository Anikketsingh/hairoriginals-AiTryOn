/**
 * POST /api/admin/bootstrap
 *
 * One-time endpoint to create the first Super Admin. There's no admin yet at
 * this point, so this is gated by a shared secret header instead of
 * requireAdmin(). Refuses to run once any admin_users row already has a
 * linked auth_id. Rotate or remove ADMIN_BOOTSTRAP_SECRET from the
 * environment after using this once.
 *
 * Header: x-bootstrap-secret: <ADMIN_BOOTSTRAP_SECRET>
 * Body (JSON): { email: string, password: string, name: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validate";

const bodySchema = z.object({
  email: z.string().email("A valid email is required."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().min(1, "Missing name."),
});

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Bootstrap is disabled (ADMIN_BOOTSTRAP_SECRET not set)." },
        { status: 403 }
      );
    }

    const provided = request.headers.get("x-bootstrap-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { count, error: countErr } = await supabaseAdmin
      .from("admin_users")
      .select("id", { count: "exact", head: true })
      .not("auth_id", "is", null);

    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "Already bootstrapped." }, { status: 409 });
    }

    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { email, password, name } = parsed.data;

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message || "Failed to create auth user." },
        { status: 500 }
      );
    }

    const { data: adminRow, error: upsertErr } = await supabaseAdmin
      .from("admin_users")
      .upsert(
        { auth_id: created.user.id, email, name, role: "super_admin", status: "active" },
        { onConflict: "email" }
      )
      .select("id, email, role")
      .single();

    if (upsertErr || !adminRow) {
      return NextResponse.json(
        { error: upsertErr?.message || "Failed to create admin_users row." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, admin: adminRow });
  } catch (err) {
    console.error("[/api/admin/bootstrap] Error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
