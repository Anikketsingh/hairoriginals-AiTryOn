/**
 * lib/generation-queue.ts
 *
 * Background asynchronous processing pipeline for AI generations.
 * Executes Gemini generation asynchronously and updates the `generations` table status.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { generateTryOn } from "@/lib/gemini";

interface ProcessJobParams {
  generationId: string;
  sessionId: string | null;
  personBase64: string;
  personType: string;
  productBase64: string;
  productType: string;
}

export async function processGenerationAsync({
  generationId,
  sessionId,
  personBase64,
  personType,
  productBase64,
  productType,
}: ProcessJobParams): Promise<void> {
  const startTime = Date.now();

  try {
    // 1. Mark status as processing
    await supabaseAdmin
      .from("generations")
      .update({ status: "processing" })
      .eq("id", generationId);

    // 2. Resolve product prompt override if linked to product
    let customPrompt: string | undefined = undefined;
    const { data: genRow } = await supabaseAdmin
      .from("generations")
      .select("product_id, products(prompt_override)")
      .eq("id", generationId)
      .single();

    if (genRow && genRow.products && (genRow.products as unknown as { prompt_override?: string }).prompt_override) {
      customPrompt = (genRow.products as unknown as { prompt_override?: string }).prompt_override ?? undefined;
    }

    // 3. Call Gemini AI try-on API with resolved prompt
    const result = await generateTryOn(
      personBase64,
      personType,
      productBase64,
      productType,
      customPrompt
    );

    const duration = Date.now() - startTime;

    // 4. Mark status as completed and store result
    await supabaseAdmin
      .from("generations")
      .update({
        status: "completed",
        result_image_base64: result.imageBase64,
        result_mime_type: result.mimeType,
        duration_ms: duration,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generationId);

    // 5. Touch session last_seen if session exists
    if (sessionId) {
      await supabaseAdmin
        .from("device_sessions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", sessionId);
    }
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
  }
}
