/**
 * GET /api/products
 *
 * Returns active products.
 * Query parameters:
 *   - category_id: Filter by category UUID
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("category_id");

    let query = supabaseAdmin
      .from("products")
      .select("id, category_id, name, slug, description, sku, price, image_url, is_active, display_order, categories(id, name, slug)")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data: products, error } = await query;

    if (error) {
      console.error("[/api/products] Fetch error:", error.message);
      return NextResponse.json({ error: "Failed to fetch products." }, { status: 500 });
    }

    return NextResponse.json(products);
  } catch (err) {
    console.error("[/api/products] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
