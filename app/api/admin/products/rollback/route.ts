/**
 * POST /api/admin/products/rollback
 *
 * Restores a product to a historical version snapshot.
 * Body: { productId: string, versionId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { productId, versionId } = await request.json();
    if (!productId || !versionId) {
      return NextResponse.json({ error: "Missing productId or versionId." }, { status: 400 });
    }

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
