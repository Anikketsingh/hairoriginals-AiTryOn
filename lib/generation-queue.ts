/**
 * lib/generation-queue.ts
 *
 * Background asynchronous processing pipeline for AI generations.
 * Executes Gemini generation asynchronously and updates the `generations` table status.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import {
  generateTryOn,
  isAllowedGeminiModel,
  DEFAULT_GEMINI_MODEL,
  type GeminiModel,
} from "@/lib/gemini";
import { getGeminiModel } from "@/lib/settings";
import { touchSession } from "@/lib/funnel";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { dispatchIntegrationEvent } from "@/lib/event-bus";
import { ensureLeadForSession, refreshLeadActivity } from "@/lib/leads";

export interface ProcessJobParams {
  generationId: string;
  sessionId: string | null;
  personBase64: string;
  personType: string;
  productBase64: string;
  productType: string;
  /**
   * Dev-only flag (see the demo button in app/(customer)/page.tsx). When set
   * AND the process is not running in production, the Gemini call is skipped
   * and the person photo is echoed back as the result — letting the whole
   * flow be exercised without spending Gemini credits. Ignored in production.
   */
  demo?: boolean;
}

// Hard gate so a stray `demo` flag can never skip the real generation in a
// production build, no matter what the client sends.
const DEMO_MODE_ALLOWED = process.env.NODE_ENV !== "production";

// Heuristic match for transient failures worth retrying once (timeouts,
// connection resets, 5xx, rate limiting) vs. permanent ones (bad input,
// safety rejection) that should fail immediately.
const RETRYABLE_ERROR_PATTERN = /timeout|ECONNRESET|fetch failed|50[0-9]|429/i;
const RETRY_DELAY_MS = 1500;

// generateTryOn has no request timeout of its own — a hung connection to
// Gemini otherwise leaves the job's promise pending forever, past both the
// try/catch below and the retry logic, relying entirely on the 3-minute
// stale-job reconciliation in the status route as a last resort. Race
// against a timeout here so a hang becomes an immediate, retryable error
// instead. (Soft timeout: the underlying call isn't aborted, just ignored.)
const GEMINI_CALL_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function generateWithRetry(
  personBase64: string,
  personType: string,
  productBase64: string,
  productType: string,
  customPrompt: string | undefined,
  model: GeminiModel
) {
  const attempt = () =>
    withTimeout(
      generateTryOn(personBase64, personType, productBase64, productType, customPrompt, model),
      GEMINI_CALL_TIMEOUT_MS,
      `Gemini request timeout after ${GEMINI_CALL_TIMEOUT_MS / 1000}s`
    );

  try {
    return await attempt();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!RETRYABLE_ERROR_PATTERN.test(message)) throw err;

    console.warn("[generation-queue] Transient error, retrying once:", message);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return await attempt();
  }
}

const RESULTS_BUCKET = "results";
const SOURCES_BUCKET = "sources";

/** Uploads an image to a private bucket keyed by generation id, returning its storage path. */
async function uploadGenerationImage(
  bucket: string,
  generationId: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const ext = mimeType.split("/")[1] ?? "png";
  const path = `${generationId}.${ext}`;
  const buffer = Buffer.from(imageBase64, "base64");

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, buffer, { contentType: mimeType, upsert: true });

  if (error) {
    throw new Error(`Failed to store image in ${bucket}: ${error.message}`);
  }
  return path;
}

/**
 * Persists the customer's captured photo so the CRM can show a before/after
 * pair and the look isn't the only surviving record of the try-on.
 *
 * Best-effort by design: the try-on is the product, the source photo is
 * metadata, so a storage failure here logs and lets generation continue
 * rather than failing the job.
 */
async function storeSourceImage(
  generationId: string,
  personBase64: string,
  personType: string
): Promise<void> {
  try {
    const path = await uploadGenerationImage(
      SOURCES_BUCKET,
      generationId,
      personBase64,
      personType
    );
    await supabaseAdmin
      .from("generations")
      .update({ source_image_path: path, source_mime_type: personType })
      .eq("id", generationId);
  } catch (err) {
    console.error(
      `[generation-queue] Failed to store source image for ${generationId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

// Category slugs (supabase/migrations/20260629000005_phase3_products.sql,
// 20260629000010_product_catalog_v2.sql) don't line up 1:1 with the seeded
// prompt_templates slugs (20260629000006_phase4_admin_and_prompts.sql) —
// e.g. category "hair-toppers" vs. template "hair-topper" — so map between
// them explicitly rather than assuming a naming convention.
const CATEGORY_TO_PROMPT_SLUG: Record<string, string> = {
  "hair-toppers": "hair-topper",
  "hair-extensions": "hair-extension",
  wigs: "wig",
  fringes: "fringe",
  "men-wigs": "wig",
};

/**
 * Resolves the prompt template to use, in order: category-matched active
 * template → the seeded "default" active template → undefined (in which
 * case generateTryOn falls back to the hardcoded HAIR_TRYON_PROMPT). Only
 * called when the product has no prompt_override of its own.
 */
async function resolvePromptTemplate(categorySlug: string | undefined): Promise<string | undefined> {
  const targetSlug = categorySlug ? CATEGORY_TO_PROMPT_SLUG[categorySlug] : undefined;
  const slugsToTry = targetSlug ? [targetSlug, "default"] : ["default"];

  for (const slug of slugsToTry) {
    const { data } = await supabaseAdmin
      .from("prompt_templates")
      .select("template")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (data?.template) return data.template as string;
  }
  return undefined;
}

export async function processGenerationAsync({
  generationId,
  sessionId,
  personBase64,
  personType,
  productBase64,
  productType,
  demo,
}: ProcessJobParams): Promise<void> {
  const startTime = Date.now();

  try {
    // 1. Mark status as processing
    await supabaseAdmin
      .from("generations")
      .update({ status: "processing" })
      .eq("id", generationId);

    // 1b. Persist the customer's photo before calling Gemini, so a failed
    //     generation still retains it — that's the case an agent most wants
    //     to look at.
    await storeSourceImage(generationId, personBase64, personType);

    // 2. Resolve prompt: product override → category-matched prompt_templates
    //    row → seeded "default" template → hardcoded fallback in gemini.ts
    const { data: genRow } = await supabaseAdmin
      .from("generations")
      .select("product_id, user_id, products(prompt_override, categories(slug))")
      .eq("id", generationId)
      .single();

    const userId = genRow?.user_id ?? null;
    const product = genRow?.products as unknown as {
      prompt_override?: string | null;
      categories?: { slug?: string } | null;
    } | null;

    const customPrompt = product?.prompt_override
      ? product.prompt_override
      : await resolvePromptTemplate(product?.categories?.slug);

    // 2b. Resolve model from Admin → AI Configuration, validated against the
    //     allowlist so a bad setting value can't silently break generation.
    const configuredModel = (await getGeminiModel()) as string;
    const model = isAllowedGeminiModel(configuredModel) ? configuredModel : DEFAULT_GEMINI_MODEL;

    // 3. Call Gemini AI try-on API with resolved prompt + model (one retry
    //    on transient failure — see generateWithRetry above). In dev-only
    //    demo mode the paid call is skipped and the person photo is echoed
    //    back so the rest of the flow can be walked without spending credits.
    let result: { imageBase64: string; mimeType: string };
    if (demo && DEMO_MODE_ALLOWED) {
      console.warn(
        `[generation-queue] DEMO mode: skipping Gemini for job ${generationId}`
      );
      // Brief pause so the "Creating your look" screen is visible, mimicking
      // real generation latency.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      result = { imageBase64: personBase64, mimeType: personType };
    } else {
      result = await generateWithRetry(
        personBase64,
        personType,
        productBase64,
        productType,
        customPrompt,
        model
      );
    }

    const duration = Date.now() - startTime;

    // 4. Store the result in Storage (not Postgres — see the migration
    //    comment for why) and mark the row completed
    const resultPath = await uploadGenerationImage(
      RESULTS_BUCKET,
      generationId,
      result.imageBase64,
      result.mimeType
    );

    await supabaseAdmin
      .from("generations")
      .update({
        status: "completed",
        result_image_path: resultPath,
        result_mime_type: result.mimeType,
        model,
        duration_ms: duration,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generationId);

    // 5. Touch session last_seen if session exists. Was previously an
    //    inline `.update({ last_seen_at: ... })` against a column that
    //    doesn't exist (device_sessions.last_seen, not last_seen_at) — the
    //    write silently no-op'd. touchSession() (lib/funnel.ts) has the
    //    correct column and is already used elsewhere.
    if (sessionId) {
      await touchSession(sessionId);
    }

    await recordAnalyticsEvent(
      "generate_completed",
      { generationId, durationMs: duration, model },
      sessionId,
      userId
    );
    await dispatchIntegrationEvent(
      "generation.completed",
      { generationId, sessionId, userId, durationMs: duration, model },
      "webhook_bus"
    );

    // Keep the CRM master in sync with engagement. Guests become a lead on
    // their first completed generation — their looks are already stored, and
    // without a lead the CRM has nothing to hang them off. ensureLeadForSession
    // is idempotent, so this is a no-op for a signed-in user who already has a
    // lead from /api/auth/complete, and the guest's lead is upgraded in place
    // (user_id + phone attached) when they later sign in.
    await ensureLeadForSession({
      sessionId,
      userId,
      source: userId ? "registration" : "guest_tryon",
      funnelStage: userId ? 2 : 0,
    });
    await refreshLeadActivity({ sessionId, userId });
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "Background processing failed.";
    console.error(`[generation-queue] Job ${generationId} failed:`, errorMessage);

    await supabaseAdmin
      .from("generations")
      .update({
        status: "failed",
        error_log: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generationId);

    await recordAnalyticsEvent(
      "generate_failed",
      { generationId, error: errorMessage },
      sessionId,
      null
    );
  }
}
