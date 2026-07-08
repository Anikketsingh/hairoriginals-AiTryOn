/**
 * POST /api/admin/products/rollback
 *
 * Restores a product to a historical version snapshot.
 * Body: { productId: string, versionId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const bodySchema = z.object({
  productId: z.string().uuid("Missing or invalid productId."),
  versionId: z.string().uuid("Missing or invalid versionId."),
});

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { productId, versionId } = parsed.data;

    const { data: ver, error: verErr } = await supabaseAdmin
      .from("product_versions")
      .select("*")
      .eq("id", versionId)
      .single();

    if (verErr || !ver) {
      return NextResponse.json({ error: "Version snapshot not found." }, { status: 404 });
    }

    const snapshot = ver.snapshot_data as Record<string, unknown>;
    const { id: _, created_at: __, updated_at: ___, ...restorable } = snapshot;

    const { data: restored, error: restErr } = await supabaseAdmin
      .from("products")
      .update({
        ...restorable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .select()
      .single();

    if (restErr || !restored) {
      return NextResponse.json({ error: "Failed to rollback product state." }, { status: 500 });
    }

    // Log rollback action as new version
    const { data: versions } = await supabaseAdmin
      .from("product_versions")
      .select("version_number")
      .eq("product_id", productId)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVer = (versions?.[0]?.version_number ?? 0) + 1;

    await supabaseAdmin.from("product_versions").insert({
      product_id: productId,
      version_number: nextVer,
      snapshot_data: restored,
      change_summary: `Restored state from Version v${ver.version_number}`,
    });

    return NextResponse.json(restored);
  } catch (err) {
    console.error("[/api/admin/products/rollback] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
