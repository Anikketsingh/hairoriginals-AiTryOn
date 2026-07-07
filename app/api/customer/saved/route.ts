/**
 * GET / POST / DELETE /api/customer/saved
 *
 * Manages saved products for a customer.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionByToken } from "@/lib/funnel";

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

    return NextResponse.json(saved);
  } catch (err) {
    console.error("[/api/customer/saved GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionToken, productId } = body;

    if (!sessionToken || !productId) {
      return NextResponse.json({ error: "Missing sessionToken or productId." }, { status: 400 });
    }

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
