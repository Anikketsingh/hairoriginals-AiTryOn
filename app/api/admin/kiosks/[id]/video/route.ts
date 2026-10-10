/**
 * POST /api/admin/kiosks/[id]/video
 *
 * Step 1 of uploading a standee's attract-screen video. Returns a one-time
 * signed upload URL for the kiosk-media bucket; the admin browser uploads
 * the file straight to Storage with it (a video is far over Vercel's 4.5MB
 * request-body cap, so it can't pass through a route handler). Step 2 is
 * PATCH /api/admin/kiosks with { id, attractVideoUrl: publicUrl }, which
 * points the standee at it and removes the previous video.
 *
 * The bucket itself enforces type (mp4/webm) and size (50MB); the checks
 * here just fail fast with a readable message.
 *
 * Body: { contentType: string, size: number }
 * Returns: { path, token, publicUrl }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";
import { KIOSK_MEDIA_BUCKET } from "@/lib/kiosk-auth";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const EXT: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };

const bodySchema = z.object({
  contentType: z.enum(["video/mp4", "video/webm"], {
    errorMap: () => ({ message: "Use an MP4 or WebM video." }),
  }),
  size: z.number().int().positive().max(MAX_VIDEO_BYTES, "Video must be 50MB or smaller."),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    const { data: kiosk } = await supabaseAdmin.from("kiosks").select("id").eq("id", id).maybeSingle();
    if (!kiosk) return NextResponse.json({ error: "Kiosk not found." }, { status: 404 });

    const path = `${id}/${Date.now()}.${EXT[parsed.data.contentType]}`;
    const bucket = supabaseAdmin.storage.from(KIOSK_MEDIA_BUCKET);
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[/api/admin/kiosks/[id]/video] Signed upload error:", error?.message);
      return NextResponse.json(
        { error: "Couldn't start the upload. Has the kiosk-media bucket migration been applied?" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      path: data.path,
      token: data.token,
      publicUrl: toPublicStorageUrl(bucket.getPublicUrl(path).data.publicUrl),
    });
  } catch (err) {
    console.error("[/api/admin/kiosks/[id]/video] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
