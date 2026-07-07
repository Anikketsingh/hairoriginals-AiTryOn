/**
 * POST /api/admin/products/duplicate
 *
 * Duplicates a product by ID with "(Copy)" suffix.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "Missing product id." }, { status: 400 });

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
