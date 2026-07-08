/**
 * GET /api/generate/status/[id]?sessionToken=...
 *
 * Polling endpoint to retrieve the current status of an async generation job.
 * Requires the caller's sessionToken and verifies it owns the generation
 * (by session_id or, once logged in, user_id) before returning anything —
 * job IDs are otherwise guessable UUIDs with no other access control.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionByToken } from "@/lib/funnel";

// Self-healing insurance independent of the job runner: if a row has sat in
// pending/processing longer than this, something killed the job without
// writing a terminal status. Rather than let the client poll forever,
// resolve it to failed the next time anyone checks.
const STALE_THRESHOLD_MS = 3 * 60 * 1000;

// Long enough for the client to fetch the image after receiving this
// response; short enough that a leaked URL doesn't stay valid.
const SIGNED_URL_TTL_SECONDS = 10 * 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionToken = request.nextUrl.searchParams.get("sessionToken");

    if (!id) {
      return NextResponse.json({ error: "Missing job ID." }, { status: 400 });
    }
    if (!sessionToken) {
      return NextResponse.json({ error: "Missing sessionToken." }, { status: 400 });
    }

    const session = await getSessionByToken(sessionToken);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const { data: generation, error } = await supabaseAdmin
      .from("generations")
      .select(
        "id, session_id, user_id, status, result_image_path, result_mime_type, error_log, duration_ms, created_at, completed_at"
      )
      .eq("id", id)
      .single();

    if (error || !generation) {
      return NextResponse.json({ error: "Generation job not found." }, { status: 404 });
    }

    const isOwner =
      generation.session_id === session.id ||
      (!!session.user_id && generation.user_id === session.user_id);

    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    let current = generation;

    const isStale =
      (current.status === "pending" || current.status === "processing") &&
      Date.now() - new Date(current.created_at).getTime() > STALE_THRESHOLD_MS;

    if (isStale) {
      const { data: reconciled } = await supabaseAdmin
        .from("generations")
        .update({
          status: "failed",
          error_log: "Generation timed out.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .in("status", ["pending", "processing"]) // no-op if it just finished
        .select(
          "id, session_id, user_id, status, result_image_path, result_mime_type, error_log, duration_ms, created_at, completed_at"
        )
        .single();

      if (reconciled) current = reconciled;
    }

    let resultUrl: string | null = null;
    if (current.status === "completed" && current.result_image_path) {
      const { data: signed, error: signError } = await supabaseAdmin.storage
        .from("results")
        .createSignedUrl(current.result_image_path, SIGNED_URL_TTL_SECONDS);
      if (signError) {
        console.error("[/api/generate/status/[id]] Signed URL error:", signError.message);
      }
      resultUrl = signed?.signedUrl ?? null;
    }

    return NextResponse.json({
      id: current.id,
      status: current.status,
      resultUrl,
      resultMimeType: current.result_mime_type,
      errorLog: current.error_log,
      durationMs: current.duration_ms,
      createdAt: current.created_at,
      completedAt: current.completed_at,
    });
  } catch (err) {
    console.error("[/api/generate/status/[id]] Error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while fetching job status." },
      { status: 500 }
    );
  }
}
