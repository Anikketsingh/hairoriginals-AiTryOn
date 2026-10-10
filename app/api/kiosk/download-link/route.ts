/**
 * POST /api/kiosk/download-link
 *
 * Mints the link behind the QR code on the kiosk result screen. The visitor
 * scans it with their phone and lands on /d/<token>, which shows and
 * downloads their look. Tokens are random and expire (config
 * downloadLinkTtlHours), so the generation id and storage path are never
 * exposed and a photographed QR stops working after a while.
 *
 * Body: { sessionToken, generationId }
 * Returns: { url, expiresAt }
 */

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validate";
import { getAppBaseUrl } from "@/lib/app-url";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { getKioskVisitorSession, requireKiosk } from "@/lib/kiosk-auth";

const bodySchema = z.object({
  sessionToken: z.string().min(1).max(200),
  generationId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const kiosk = await requireKiosk(request);
  if (kiosk instanceof NextResponse) return kiosk;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { sessionToken, generationId } = parsed.data;

    const session = await getKioskVisitorSession(kiosk, sessionToken);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const { data: generation } = await supabaseAdmin
      .from("generations")
      .select("id, session_id, status, result_image_path")
      .eq("id", generationId)
      .maybeSingle();

    if (
      !generation ||
      generation.session_id !== session.id ||
      generation.status !== "completed" ||
      !generation.result_image_path
    ) {
      return NextResponse.json({ error: "Result not found." }, { status: 404 });
    }

    const token = randomBytes(12).toString("base64url");
    const expiresAt = new Date(Date.now() + kiosk.config.downloadLinkTtlHours * 60 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin.from("result_downloads").insert({
      token,
      generation_id: generation.id,
      kiosk_id: kiosk.id,
      expires_at: expiresAt,
    });
    if (error) {
      console.error("[/api/kiosk/download-link] Insert error:", error.message);
      return NextResponse.json({ error: "Could not create a download link." }, { status: 500 });
    }

    await recordAnalyticsEvent("kiosk_download_link_created", { generationId }, session.id, null);

    return NextResponse.json({ url: `${getAppBaseUrl()}/d/${token}`, expiresAt });
  } catch (err) {
    console.error("[/api/kiosk/download-link] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
