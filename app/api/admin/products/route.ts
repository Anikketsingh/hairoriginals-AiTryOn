/**
 * GET & POST /api/admin/products
 *
 * Full admin CRUD & listing for catalog management.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
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
  try {
    const body = await request.json();
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
    } = body;

    if (!name || !image_url) {
      return NextResponse.json({ error: "Missing required fields: name and image_url." }, { status: 400 });
    }

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
