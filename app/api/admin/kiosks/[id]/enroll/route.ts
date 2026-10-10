/**
 * POST /api/admin/kiosks/[id]/enroll
 *
 * Issue a new one-time enrollment link for a kiosk (24h validity). Used to
 * set up a replacement PC, or to re-enroll after a revoke. The standee's
 * current device secret keeps working until the new code is actually used.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { issueEnrollCode } from "../../enroll-code";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const { data: kiosk } = await supabaseAdmin.from("kiosks").select("id").eq("id", id).maybeSingle();
  if (!kiosk) return NextResponse.json({ error: "Kiosk not found." }, { status: 404 });

  const enrollment = await issueEnrollCode(id);
  if (!enrollment) {
    return NextResponse.json({ error: "Failed to issue an enrollment code." }, { status: 500 });
  }
  return NextResponse.json({ enrollment });
}
