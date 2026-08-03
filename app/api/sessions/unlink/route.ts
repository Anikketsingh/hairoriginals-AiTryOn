/**
 * POST /api/sessions/unlink
 *
 * Called by the browser on sign-out. Detaches the device session from the
 * user account (device_sessions.user_id = null) without touching the
 * session's credit history — the point is that signing out must NOT hand
 * the browser a fresh guest_free credit. Previously the client deleted its
 * localStorage session token on sign-out instead, which did exactly that:
 * the next page load minted a brand-new device_sessions row via
 * POST /api/sessions.
 *
 * Body (JSON): { sessionToken: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionByToken } from "@/lib/funnel";
import { parseJsonBody } from "@/lib/validate";

const bodySchema = z.object({ sessionToken: z.string().min(1) });

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { sessionToken } = parsed.data;

    const session = await getSessionByToken(sessionToken);
    if (!session) {
      // Already gone / never existed — sign-out should proceed regardless.
      return NextResponse.json({ success: true });
    }

    await supabaseAdmin
      .from("device_sessions")
      .update({ user_id: null })
      .eq("id", session.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/sessions/unlink] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
