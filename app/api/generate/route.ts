import { NextRequest, NextResponse } from "next/server";
import {
  getSessionByToken,
  getFunnelStage,
  consumeCredit,
} from "@/lib/funnel";
import { getLoginGateMessage } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import { enqueueGenerationJob } from "@/lib/jobs/runner";
import { getClientIp, checkGenerateRateLimit } from "@/lib/rate-limit";
import { recordAnalyticsEvent } from "@/lib/analytics";

// Max invocation duration for the after()-scheduled background job (the Gemini
// call + one retry). Capped at 60 because the app runs on Vercel's Hobby plan,
// whose ceiling is 60s — a higher value (we previously set 120) is silently
// clamped there. NOTE: a slow Gemini call (up to ~90s, see
// GEMINI_CALL_TIMEOUT_MS in generation-queue.ts) can still exceed 60s and be
// killed on Hobby; the real fix for that is Vercel Pro (300s) or moving
// generation to a durable queue/worker.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // ── Extract inputs ──────────────────────────────────────────
    const personImage = formData.get("personImage") as File | null;
    const productImage = formData.get("productImage") as File | null;
    const sessionToken = formData.get("sessionToken") as string | null;
    const productId = formData.get("productId") as string | null;
    // Dev-only demo flag — the background job only honors it outside
    // production (see DEMO_MODE_ALLOWED in lib/generation-queue.ts).
    const demo = formData.get("demo") === "true";

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

    // ── Rate limit — per session once one exists, else per IP ─
    const rateLimitKey = sessionId ?? getClientIp(request);
    const allowed = await checkGenerateRateLimit(rateLimitKey);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down and try again shortly." },
        { status: 429 }
      );
    }

    // Resolve funnel stage
    const stage = sessionId
      ? await getFunnelStage(sessionId, userId)
      : 1;

    if (stage === 1) {
      await recordAnalyticsEvent("gate_shown", { gate: "login" }, sessionId, userId);
      const message = await getLoginGateMessage();
      return NextResponse.json(
        { gate: "login", message, stage: 1 },
        { status: 402 }
      );
    }

    // Signed-in users have unlimited try-ons: no credit is consumed and the
    // generation is recorded with credit_id = null. Guests (stage 0) still
    // consume one of their free credits atomically before queueing.
    let creditId: string | null = null;
    if (!userId) {
      creditId = sessionId ? await consumeCredit(sessionId, userId) : null;
      if (!creditId) {
        const message = await getLoginGateMessage();
        return NextResponse.json(
          { gate: "login", message, stage: 1 },
          { status: 402 }
        );
      }
    }

    // ── Create initial generation record (status: pending) ────
    // The `model` column is resolved and validated against the allowlist in
    // lib/generation-queue.ts once the job actually runs, and written there.
    const { data: generationRow, error: insertError } = await supabaseAdmin
      .from("generations")
      .insert({
        session_id: sessionId,
        user_id: userId,
        credit_id: creditId,
        product_id: productId || null,
        status: "pending",
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

    // ── Schedule background processing (survives past this response — see
    //    lib/jobs/runner.ts for why this replaced a bare fire-and-forget call)
    enqueueGenerationJob({
      generationId: generationRow.id,
      sessionId,
      personBase64,
      personType: personImage.type,
      productBase64,
      productType: productImage.type,
      demo,
    });

    await recordAnalyticsEvent("generate_started", { productId: productId || null }, sessionId, userId);

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
