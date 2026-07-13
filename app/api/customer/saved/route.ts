/**
 * GET / POST / DELETE /api/customer/saved
 *
 * Manages saved products for a customer.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionByToken } from "@/lib/funnel";
import { parseJsonBody } from "@/lib/validate";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";

const savedBodySchema = z.object({
  sessionToken: z.string().min(1, "Missing sessionToken."),
  productId: z.string().uuid("productId must be a valid product ID."),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get("sessionToken");

    if (!sessionToken) {
      return NextResponse.json({ error: "Missing sessionToken." }, { status: 400 });
    }

    const session = await getSessionByToken(sessionToken);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

    const orFilter = session.user_id
      ? `user_id.eq.${session.user_id},session_id.eq.${session.id}`
      : `session_id.eq.${session.id}`;

    const { data: saved, error } = await supabaseAdmin
      .from("saved_products")
      .select("id, created_at, products(id, name, slug, image_url, price, description)")
      .or(orFilter)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch saved products." }, { status: 500 });
    }

    const withPublicUrls = (saved ?? []).map(({ products, ...rest }) => ({
      ...rest,
      products: products
        ? { ...products, image_url: toPublicStorageUrl((products as { image_url?: string | null }).image_url) }
        : products,
    }));

    return NextResponse.json(withPublicUrls);
  } catch (err) {
    console.error("[/api/customer/saved GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonBody(request, savedBodySchema);
    if (parsed.error) return parsed.error;
    const { sessionToken, productId } = parsed.data;

    const session = await getSessionByToken(sessionToken);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from("saved_products")
      .upsert(
        {
          session_id: session.id,
          user_id: session.user_id,
          product_id: productId,
        },
        { onConflict: "user_id,session_id,product_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to save product." }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/customer/saved POST] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
