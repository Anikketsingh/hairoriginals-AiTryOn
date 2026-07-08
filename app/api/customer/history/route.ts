/**
 * GET /api/customer/history
 *
 * Returns try-on history for a given sessionToken. Results are stored in
 * Supabase Storage (see lib/generation-queue.ts); this batch-signs a URL per
 * completed row instead of returning image bytes inline.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionByToken } from "@/lib/funnel";

const SIGNED_URL_TTL_SECONDS = 10 * 60;

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
      .select(
        "id, status, result_image_path, result_mime_type, duration_ms, is_saved, created_at, completed_at, products(id, name, image_url, price)"
      )
      .or(orFilter)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[/api/customer/history] Fetch error:", error.message);
      return NextResponse.json({ error: "Failed to fetch history." }, { status: 500 });
    }

    const paths = (generations ?? [])
      .map((g) => g.result_image_path)
      .filter((p): p is string => !!p);

    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signedUrls, error: signError } = await supabaseAdmin.storage
        .from("results")
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

      if (signError) {
        console.error("[/api/customer/history] Signed URL error:", signError.message);
      }
      signedUrls?.forEach((s) => {
        if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
      });
    }

    const withUrls = (generations ?? []).map(({ result_image_path, ...rest }) => ({
      ...rest,
      result_url: result_image_path ? urlByPath.get(result_image_path) ?? null : null,
    }));

    return NextResponse.json(withUrls);
  } catch (err) {
    console.error("[/api/customer/history] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
