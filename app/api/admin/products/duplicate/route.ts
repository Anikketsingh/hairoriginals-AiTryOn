/**
 * POST /api/admin/products/duplicate
 *
 * Duplicates a product by ID with "(Copy)" suffix.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const bodySchema = z.object({ id: z.string().uuid("Missing or invalid product id.") });

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { id } = parsed.data;

    const { data: orig, error: origErr } = await supabaseAdmin.from("products").select("*").eq("id", id).single();
    if (origErr || !orig) return NextResponse.json({ error: "Original product not found." }, { status: 404 });

    const newName = `${orig.name} (Copy)`;
    const newSlug = `${orig.slug}-copy-${Date.now().toString().slice(-4)}`;
    const newSku = `${orig.sku || "HO"}-COPY-${Math.floor(1000 + Math.random() * 9000)}`;

    const { id: _, created_at: __, updated_at: ___, ...copyData } = orig;

    const { data: newProd, error: newErr } = await supabaseAdmin
      .from("products")
      .insert({
        ...copyData,
        name: newName,
        slug: newSlug,
        sku: newSku,
        status: "draft",
      })
      .select()
      .single();

    if (newErr || !newProd) {
      return NextResponse.json({ error: "Failed to duplicate product." }, { status: 500 });
    }

    await supabaseAdmin.from("product_versions").insert({
      product_id: newProd.id,
      version_number: 1,
      snapshot_data: newProd,
      change_summary: `Duplicated from product ${orig.name}`,
    });

    return NextResponse.json(newProd);
  } catch (err) {
    console.error("[/api/admin/products/duplicate] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
