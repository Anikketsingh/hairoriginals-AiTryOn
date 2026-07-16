/**
 * GET /api/categories
 *
 * Returns active categories ordered by display_order.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { data: categories, error } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, description, gender, display_order")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("[/api/categories] Fetch error:", error.message);
      return NextResponse.json({ error: "Failed to fetch categories." }, { status: 500 });
    }

    return NextResponse.json(categories);
  } catch (err) {
    console.error("[/api/categories] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
