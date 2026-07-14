/**
 * GET, PUT, DELETE /api/admin/products/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const numericField = z.union([z.number(), z.string()]).optional();

// A PUT can touch any subset of fields — the admin UI doesn't necessarily
// send the full product shape — so everything here is optional; only types
// are enforced, not presence.
const updateProductBodySchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  sku: z.string().optional(),
  category_id: z.string().uuid().optional().nullable(),
  gender: z.string().optional(),
  brand: z.string().optional(),
  short_description: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  selling_price: numericField,
  mrp: numericField,
  discount_percentage: numericField,
  image_url: z.string().optional(),
  shop_url: z.string().trim().url("shop_url must be a valid URL").optional().or(z.literal("")).nullable(),
  hair_type: z.string().optional().nullable(),
  hair_length: z.string().optional().nullable(),
  hair_density: z.string().optional().nullable(),
  hair_color: z.string().optional().nullable(),
  base_material: z.string().optional().nullable(),
  installation_type: z.string().optional().nullable(),
  recommended_for: z.string().optional().nullable(),
  is_featured: z.boolean().optional(),
  is_new_arrival: z.boolean().optional(),
  is_best_seller: z.boolean().optional(),
  is_trending: z.boolean().optional(),
  prompt_override: z.string().optional().nullable(),
  status: z.string().optional(),
  change_summary: z.string().optional(),
});

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const { data: product, error } = await supabaseAdmin
      .from("products")
      .select("*, category:categories(*), product_ai_assets(*), product_versions(*)")
      .eq("id", id)
      .single();

    if (error || !product) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (err) {
    console.error("[/api/admin/products/[id] GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const parsed = await parseJsonBody(request, updateProductBodySchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // 1. Fetch current max version number
    const { data: versions } = await supabaseAdmin
      .from("product_versions")
      .select("version_number")
      .eq("product_id", id)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVer = (versions?.[0]?.version_number ?? 0) + 1;

    // 2. Update product
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("products")
      .update({
        name: body.name,
        slug: body.slug,
        sku: body.sku,
        category_id: body.category_id || null,
        gender: body.gender || "women",
        brand: body.brand,
        short_description: body.short_description,
        description: body.description,
        price: Number(body.selling_price) || 0,
        selling_price: Number(body.selling_price) || 0,
        mrp: Number(body.mrp) || 0,
        discount_percentage: Number(body.discount_percentage) || 0,
        image_url: body.image_url,
        shop_url: body.shop_url || null,
        hair_type: body.hair_type,
        hair_length: body.hair_length,
        hair_density: body.hair_density,
        hair_color: body.hair_color,
        base_material: body.base_material,
        installation_type: body.installation_type,
        recommended_for: body.recommended_for,
        is_featured: !!body.is_featured,
        is_new_arrival: !!body.is_new_arrival,
        is_best_seller: !!body.is_best_seller,
        is_trending: !!body.is_trending,
        prompt_override: body.prompt_override || null,
        status: body.status || "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updErr || !updated) {
      console.error("[/api/admin/products/[id] PUT] Error:", updErr?.message);
      return NextResponse.json({ error: "Failed to update product." }, { status: 500 });
    }

    // 3. Log snapshot to product_versions
    await supabaseAdmin.from("product_versions").insert({
      product_id: id,
      version_number: nextVer,
      snapshot_data: updated,
      change_summary: body.change_summary || `Updated fields (Version v${nextVer})`,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[/api/admin/products/[id] PUT] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const { error } = await supabaseAdmin.from("products").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to delete product." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/admin/products/[id] DELETE] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
