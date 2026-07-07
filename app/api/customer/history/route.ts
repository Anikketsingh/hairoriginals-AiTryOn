/**
 * GET /api/customer/history
 *
 * Returns try-on history for a given sessionToken.
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
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const orFilter = session.user_id
      ? `user_id.eq.${session.user_id},session_id.eq.${session.id}`
      : `session_id.eq.${session.id}`;

    const { data: generations, error } = await supabaseAdmin
      .from("generations")
      .select("id, status, result_image_base64, result_mime_type, duration_ms, created_at, completed_at, products(id, name, image_url, price)")
      .or(orFilter)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[/api/customer/history] Fetch error:", error.message);
      return NextResponse.json({ error: "Failed to fetch history." }, { status: 500 });
    }

    return NextResponse.json(generations);
  } catch (err) {
    console.error("[/api/customer/history] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
