/**
 * lib/gemini-vision.ts
 *
 * Face analysis + style matching for the AI Stylist (POST /api/suggest).
 *
 * Sits beside lib/gemini.ts as the only other module allowed to import
 * @google/genai. Kept separate because the two calls have nothing in common
 * beyond the SDK: this one takes ONE image and returns structured JSON, while
 * generateTryOn takes two images and returns an image.
 *
 * WHY THE MODEL ID IS A CONSTANT HERE, not an entry in lib/gemini-models.ts:
 * that catalog is documented as image-*output* models only (a text tier added
 * there would fail every try-on at the "returned text instead of an image"
 * throw), and its `pricePerImageUsd` is the wrong billing unit for a
 * token-priced text call. If this ever needs to be admin-configurable, split
 * the catalog out into its own SDK-free module the way gemini-models.ts is.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { buildStyleSuggestionPrompt, type SuggestCandidate } from "@/lib/prompt";
import { withTimeout, isRetryableAiError } from "@/lib/ai-retry";

/**
 * Text-output tier: accepts image input, returns JSON. Not an image model.
 *
 * Chosen over gemini-3.5-flash on measurement, not assumption. Ranking ~40
 * short catalog lines against one photo is an easy task, and:
 *   flash      ~8-18s, and slower still with its default (automatic) thinking
 *              budget — repeatedly blew a 20s timeout on identical input.
 *   flash-lite ~2.2-2.6s, thoughtsTokenCount 0, with matches and rationales of
 *              equal quality.
 * Lite also rejects `thinkingConfig` entirely (400 INVALID_ARGUMENT), which is
 * why none is sent below.
 */
export const SUGGESTION_MODEL = "gemini-3.5-flash-lite";

/**
 * Upper bound on catalog rows sent to the model. Bounds prompt size (and so
 * cost and latency) for a catalog that can grow without limit, and keeps the
 * numbered list short enough that index selection stays reliable.
 */
export const SUGGEST_CANDIDATE_LIMIT = 40;

/** How many styles the customer is shown. */
export const SUGGEST_MATCH_COUNT = 3;

// Purely a hang guard — measured calls land in ~2-3s. Sized so a timeout plus
// the retry (20 + 1.2 + 20) still fits inside the route's 60s ceiling.
const VISION_CALL_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1200;

// Everything except `faceDetected` and `matches` is optional in the schema
// below, so parse defensively rather than trusting the model to fill it in.
const rawResultSchema = z.object({
  faceDetected: z.boolean(),
  faceShape: z.string().optional().default(""),
  hairType: z.string().optional().default(""),
  skinTone: z.string().optional().default(""),
  summary: z.string().optional().default(""),
  matches: z
    .array(
      z.object({
        index: z.number().int(),
        matchScore: z.number().optional().default(0),
        reason: z.string().optional().default(""),
      })
    )
    .default([]),
});

type RawSuggestionResult = z.infer<typeof rawResultSchema>;

/**
 * Token counts for one call. Surfaced because this model is token-billed and
 * so is invisible to Admin → Costs (which prices per generated image) — the
 * analytics event is the only record of what a scan actually cost.
 */
export interface SuggestionUsage {
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
}

export type SuggestionResult = RawSuggestionResult & { usage: SuggestionUsage };

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    faceDetected: {
      type: Type.BOOLEAN,
      description: "True only if a human face is clearly visible in the photo.",
    },
    faceShape: { type: Type.STRING, description: "e.g. oval, round, square, heart." },
    hairType: { type: Type.STRING, description: "Texture, density and length, e.g. 'fine, straight'." },
    skinTone: { type: Type.STRING, description: "Undertone only, e.g. 'warm medium'." },
    summary: { type: Type.STRING, description: "One short sentence describing face and hair." },
    matches: {
      type: Type.ARRAY,
      description: `Exactly ${SUGGEST_MATCH_COUNT} catalog picks, best first. Empty if no face was found.`,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER, description: "The [n] number of the chosen catalog entry." },
          matchScore: { type: Type.INTEGER, description: "Confidence, 0-100." },
          reason: { type: Type.STRING, description: "One sentence, 18 words max, addressed to the customer." },
        },
        required: ["index", "matchScore", "reason"],
      },
    },
  },
  required: ["faceDetected", "matches"],
};

/**
 * Analyses the customer photo and ranks `candidates`.
 *
 * Returns the model's raw answer with **1-based indices into `candidates`** —
 * the caller is responsible for mapping them back and discarding anything out
 * of range. Throws on timeout, a blocked prompt, or an unparseable response.
 */
export async function analyzeFaceForStyles(
  personBase64: string,
  personMime: string,
  candidates: SuggestCandidate[]
): Promise<SuggestionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not set. Please create a .env.local file with your key."
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const promptText = buildStyleSuggestionPrompt(candidates);
  const startedAt = Date.now();

  const attempt = () =>
    withTimeout(
      ai.models.generateContent({
        model: SUGGESTION_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: personMime, data: personBase64 } },
              { text: promptText },
            ],
          },
        ],
        // No thinkingConfig: this model rejects the field outright with
        // INVALID_ARGUMENT, and doesn't need it — measured responses come back
        // with thoughtsTokenCount 0. See SUGGESTION_MODEL above.
        config: {
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
      VISION_CALL_TIMEOUT_MS,
      `Gemini vision request timeout after ${VISION_CALL_TIMEOUT_MS / 1000}s`
    );

  let response;
  try {
    response = await attempt();
  } catch (err) {
    if (!isRetryableAiError(err)) throw err;
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[gemini-vision] Transient error, retrying once:", message);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    response = await attempt();
  }

  // An empty candidates array usually means the prompt was blocked outright
  // (safety filters on the customer photo) rather than a transient failure —
  // surface the actual reason, matching how lib/gemini.ts reports it.
  const candidatesOut = response.candidates;
  if (!candidatesOut || candidatesOut.length === 0) {
    const blockReason = response.promptFeedback?.blockReason;
    const blockMessage = response.promptFeedback?.blockReasonMessage;
    const detail = blockReason
      ? ` (blockReason: ${blockReason}${blockMessage ? ` — ${blockMessage}` : ""})`
      : "";
    throw new Error(`No candidates returned from Gemini vision API.${detail}`);
  }

  const text = response.text;
  if (!text || text.trim() === "") {
    const finishReason = candidatesOut[0].finishReason;
    throw new Error(
      `Empty response from Gemini vision API.${finishReason ? ` (finishReason: ${finishReason})` : ""}`
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error("Gemini vision API returned malformed JSON.");
  }

  const parsed = rawResultSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(`Gemini vision API response failed validation: ${parsed.error.message}`);
  }

  const meta = response.usageMetadata;
  const usage = {
    promptTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
    thoughtTokens: meta?.thoughtsTokenCount ?? 0,
  };
  // Operational log for a call that Admin → Costs cannot see.
  console.info(
    `[gemini-vision] ${SUGGESTION_MODEL} ${Date.now() - startedAt}ms ` +
      `prompt=${usage.promptTokens} output=${usage.outputTokens} thoughts=${usage.thoughtTokens}`
  );

  return { ...parsed.data, usage };
}
