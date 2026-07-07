/**
 * GET /api/generate/status/[id]
 *
 * Polling endpoint to retrieve the current status of an async generation job.
 * Next.js 16 App Router Route Handler.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing job ID." }, { status: 400 });
    }

    const { data: generation, error } = await supabaseAdmin
      .from("generations")
      .select(
        "id, status, result_image_base64, result_mime_type, error_log, duration_ms, created_at, completed_at"
      )
      .eq("id", id)
      .single();

    if (error || !generation) {
      return NextResponse.json(
        { error: "Generation job not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: generation.id,
      status: generation.status,
      resultImageBase64: generation.result_image_base64,
      resultMimeType: generation.result_mime_type,
      errorLog: generation.error_log,
      durationMs: generation.duration_ms,
      createdAt: generation.created_at,
      completedAt: generation.completed_at,
    });
  } catch (err) {
    console.error("[/api/generate/status/[id]] Error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while fetching job status." },
      { status: 500 }
    );
  }
}
