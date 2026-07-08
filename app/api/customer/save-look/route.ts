/**
 * POST /api/customer/save-look
 *
 * Marks a generation (an actual AI result — including custom, non-catalog
 * looks) as saved. saved_products only holds catalog product_ids, so this is
 * the path for saving a generated *result* rather than a catalog *style*.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSessionByToken } from "@/lib/funnel";
import { parseJsonBody } from "@/lib/validate";

const saveLookSchema = z.object({
  sessionToken: z.string().min(1, "Missing sessionToken."),
  generationId: z.string().uuid("generationId must be a valid ID."),
  saved: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonBody(request, saveLookSchema);
    if (parsed.error) return parsed.error;
    const { sessionToken, generationId, saved } = parsed.data;

    const session = await getSessionByToken(sessionToken);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

    // Ownership check — the generation must belong to this session or user
    // (mirrors the IDOR guard on /api/generate/status/[id]).
    const { data: generation, error: fetchError } = await supabaseAdmin
      .from("generations")
      .select("id, session_id, user_id")
      .eq("id", generationId)
      .single();

    if (fetchError || !generation) {
      return NextResponse.json({ error: "Look not found." }, { status: 404 });
    }

    const owns =
      generation.session_id === session.id ||
      (!!session.user_id && generation.user_id === session.user_id);
    if (!owns) {
      return NextResponse.json({ error: "Not authorized to save this look." }, { status: 403 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("generations")
      .update({ is_saved: saved })
      .eq("id", generationId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to save look." }, { status: 500 });
    }

    return NextResponse.json({ id: generationId, is_saved: saved });
  } catch (err) {
    console.error("[/api/customer/save-look POST] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}