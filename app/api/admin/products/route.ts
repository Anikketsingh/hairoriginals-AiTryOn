/**
 * GET & POST /api/admin/products
 *
 * Full admin CRUD & listing for catalog management.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const numericField = z.union([z.number(), z.string()]).optional();

const createProductBodySchema = z.object({
  name: z.string().min(1, "name is required"),
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
  image_url: z.string().min(1, "image_url is required"),
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
  ai_assets: z
    .array(z.object({ asset_type: z.string(), url: z.string(), alt_text: z.string().optional() }))
    .optional(),
});

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const gender = searchParams.get("gender");
    const status = searchParams.get("status");

    let query = supabaseAdmin
      .from("products")
      .select("*, category:categories(*), product_ai_assets(*), product_versions(count)")
      .order("created_at", { ascending: false });

    if (gender && gender !== "all") {
      query = query.eq("gender", gender);
    }
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: products, error } = await query;

    if (error) {
      console.error("[/api/admin/products GET] Error:", error.message);
      return NextResponse.json({ error: "Failed to fetch products." }, { status: 500 });
    }

    return NextResponse.json(products);
  } catch (err) {
    console.error("[/api/admin/products GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, createProductBodySchema);
    if (parsed.error) return parsed.error;
    const {
      name,
      slug,
      sku,
      category_id,
      gender,
      brand,
      short_description,
      description,
      selling_price,
      mrp,
      discount_percentage,
      image_url,
      hair_type,
      hair_length,
      hair_density,
      hair_color,
      base_material,
      installation_type,
      recommended_for,
      is_featured,
      is_new_arrival,
      is_best_seller,
      is_trending,
      prompt_override,
      status,
      ai_assets,
    } = parsed.data;

    const productSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");

    // 1. Insert product
    const { data: product, error: prodErr } = await supabaseAdmin
      .from("products")
      .insert({
        name,
        slug: productSlug,
        sku: sku || `HO-${Math.floor(1000 + Math.random() * 9000)}`,
        category_id: category_id || null,
        gender: gender || "women",
        brand: brand || "HairOriginals",
        short_description: short_description || null,
        description: description || null,
        price: Number(selling_price) || 0,
        selling_price: Number(selling_price) || 0,
        mrp: Number(mrp) || Number(selling_price) || 0,
        discount_percentage: Number(discount_percentage) || 0,
        image_url,
        hair_type: hair_type || null,
        hair_length: hair_length || null,
        hair_density: hair_density || null,
        hair_color: hair_color || null,
        base_material: base_material || null,
        installation_type: installation_type || null,
        recommended_for: recommended_for || null,
        is_featured: !!is_featured,
        is_new_arrival: !!is_new_arrival,
        is_best_seller: !!is_best_seller,
        is_trending: !!is_trending,
        prompt_override: prompt_override || null,
        status: status || "published",
      })
      .select()
      .single();

    if (prodErr || !product) {
      console.error("[/api/admin/products POST] Insert error:", prodErr?.message);
      return NextResponse.json({ error: "Failed to create product." }, { status: 500 });
    }

    // 2. Insert AI Assets if provided
    if (Array.isArray(ai_assets) && ai_assets.length > 0) {
      const assetsToInsert = ai_assets.map((ast: { asset_type: string; url: string; alt_text?: string }) => ({
        product_id: product.id,
        asset_type: ast.asset_type,
        url: ast.url,
        alt_text: ast.alt_text || null,
      }));
      await supabaseAdmin.from("product_ai_assets").insert(assetsToInsert);
    }

    // 3. Create initial Version v1 snapshot
    await supabaseAdmin.from("product_versions").insert({
      product_id: product.id,
      version_number: 1,
      snapshot_data: product,
      change_summary: "Initial product creation",
    });

    return NextResponse.json(product);
  } catch (err) {
    console.error("[/api/admin/products POST] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
