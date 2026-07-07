import { NextRequest, NextResponse } from "next/server";
import {
  getSessionByToken,
  getFunnelStage,
  consumeCredit,
} from "@/lib/funnel";
import { getLoginGateMessage, getAgentGateMessage, getGeminiModel } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { processGenerationAsync } from "@/lib/generation-queue";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // ── Extract inputs ──────────────────────────────────────────
    const personImage = formData.get("personImage") as File | null;
    const productImage = formData.get("productImage") as File | null;
    const sessionToken = formData.get("sessionToken") as string | null;
    const productId = formData.get("productId") as string | null;

    if (!personImage || !productImage) {
      return NextResponse.json(
        { error: "Both person image and product image are required." },
        { status: 400 }
      );
    }

    // ── Validate file types ────────────────────────────────────
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(personImage.type)) {
      return NextResponse.json(
        { error: `Invalid person image type: ${personImage.type}. Use PNG, JPEG, or WEBP.` },
        { status: 400 }
      );
    }
    if (!allowedTypes.includes(productImage.type)) {
      return NextResponse.json(
        { error: `Invalid product image type: ${productImage.type}. Use PNG, JPEG, or WEBP.` },
        { status: 400 }
      );
    }

    // ── Validate file sizes ────────────────────────────────────
    const maxBytes = 10 * 1024 * 1024;
    if (personImage.size > maxBytes) {
      return NextResponse.json(
        { error: "Person image exceeds 10MB limit. Please use a smaller image." },
        { status: 400 }
      );
    }
    if (productImage.size > maxBytes) {
      return NextResponse.json(
        { error: "Product image exceeds 10MB limit. Please use a smaller image." },
        { status: 400 }
      );
    }

    // ── Funnel gate check ──────────────────────────────────────
    let sessionId: string | null = null;
    let userId: string | null = null;

    if (sessionToken) {
      const session = await getSessionByToken(sessionToken);
      if (session) {
        sessionId = session.id;
        userId = session.user_id;
      }
    }

    // Resolve funnel stage
    const stage = sessionId
      ? await getFunnelStage(sessionId, userId)
      : 1;

    if (stage === 1) {
      const message = await getLoginGateMessage();
      return NextResponse.json(
        { gate: "login", message, stage: 1 },
        { status: 402 }
      );
    }

    if (stage === 3) {
      if (sessionId) {
        await createLeadIfNeeded(sessionId, userId);
      }
      const message = await getAgentGateMessage();
      return NextResponse.json(
        { gate: "agent", message, stage: 3 },
        { status: 402 }
      );
    }

    // Stage 0 or 2 — consume one credit atomically before queueing
    const creditId = sessionId
      ? await consumeCredit(sessionId, userId)
      : null;

    if (!creditId) {
      const message = await getLoginGateMessage();
      return NextResponse.json(
        { gate: "login", message, stage: 1 },
        { status: 402 }
      );
    }

    // ── Create initial generation record (status: pending) ────
    const model = (await getGeminiModel()) as string;
    const { data: generationRow, error: insertError } = await supabaseAdmin
      .from("generations")
      .insert({
        session_id: sessionId,
        user_id: userId,
        credit_id: creditId,
        product_id: productId || null,
        status: "pending",
        model,
      })
      .select("id")
      .single();

    if (insertError || !generationRow) {
      console.error("[/api/generate] Failed to insert generation job:", insertError?.message);
      return NextResponse.json(
        { error: "Failed to create generation job." },
        { status: 500 }
      );
    }

    // ── Convert images to base64 for background task ──────────
    const personBuffer = await personImage.arrayBuffer();
    const personBase64 = Buffer.from(personBuffer).toString("base64");

    const productBuffer = await productImage.arrayBuffer();
    const productBase64 = Buffer.from(productBuffer).toString("base64");

    // ── Trigger async processing in background (fire-and-forget)
    processGenerationAsync({
      generationId: generationRow.id,
      sessionId,
      personBase64,
      personType: personImage.type,
      productBase64,
      productType: productImage.type,
    }).catch((err) => {
      console.error("[/api/generate] Background processing unhandled exception:", err);
    });

    // ── Return job ID immediately ──────────────────────────────
    return NextResponse.json(
      { jobId: generationRow.id, status: "pending" },
      { status: 202 }
    );
  } catch (err: unknown) {
    console.error("[/api/generate] Unexpected error:", err);
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      { error: `Generation submission failed: ${message}` },
      { status: 500 }
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────

async function createLeadIfNeeded(
  sessionId: string,
  userId: string | null
): Promise<void> {
  try {
    const matchFilter = userId ? { user_id: userId } : { session_id: sessionId };
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("id")
      .match(matchFilter)
      .limit(1);

    if (existing && existing.length > 0) return;

    const { data: genCount } = await supabaseAdmin
      .from("generations")
      .select("id", { count: "exact" })
      .or(
        userId
          ? `user_id.eq.${userId},session_id.eq.${sessionId}`
          : `session_id.eq.${sessionId}`
      )
      .eq("status", "completed");

    let phone: string | null = null;
    if (userId) {
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("phone")
        .eq("id", userId)
        .single();
      phone = user?.phone ?? null;
    }

    await supabaseAdmin.from("leads").insert({
      user_id: userId ?? null,
      session_id: sessionId,
      phone,
      funnel_stage_at_creation: 3,
      generations_count: genCount?.length ?? 0,
      source: "agent_gate",
    });
  } catch (err) {
    console.error("[generate] createLeadIfNeeded error:", err);
  }
}
