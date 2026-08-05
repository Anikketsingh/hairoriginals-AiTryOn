import { GoogleGenAI } from "@google/genai";
import { HAIR_TRYON_PROMPT } from "@/lib/prompt";
import { DEFAULT_GEMINI_MODEL, type GeminiModel } from "@/lib/gemini-models";

// The allowlist lives in lib/gemini-models.ts so the admin model picker can
// import it without dragging @google/genai into the client bundle. Re-exported
// here because callers (lib/generation-queue.ts) already reach for it via this
// module. Admin → AI Configuration can only ever store one of those ids;
// anything else falls back to DEFAULT_GEMINI_MODEL rather than being passed
// straight through to the API.
export {
  ALLOWED_GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL,
  isAllowedGeminiModel,
  type GeminiModel,
} from "@/lib/gemini-models";

export async function generateTryOn(
  personBase64: string,
  personMime: string,
  productBase64: string,
  productMime: string,
  customPrompt?: string,
  model: GeminiModel = DEFAULT_GEMINI_MODEL
): Promise<{ imageBase64: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not set. Please create a .env.local file with your key."
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const promptText = customPrompt && customPrompt.trim() !== "" ? customPrompt : HAIR_TRYON_PROMPT;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: personMime,
              data: personBase64,
            },
          },
          {
            inlineData: {
              mimeType: productMime,
              data: productBase64,
            },
          },
          {
            text: promptText,
          },
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    // An empty candidates array usually means Gemini blocked the prompt
    // outright (e.g. safety filters on one of the two photos) rather than a
    // transient failure — promptFeedback carries the actual reason, so
    // surface it instead of a bare "no candidates" that gives agents nothing
    // to act on when triaging error_log.
    const blockReason = response.promptFeedback?.blockReason;
    const blockMessage = response.promptFeedback?.blockReasonMessage;
    const detail = blockReason
      ? ` (blockReason: ${blockReason}${blockMessage ? ` — ${blockMessage}` : ""})`
      : "";
    throw new Error(`No candidates returned from Gemini API.${detail}`);
  }

  const parts = candidates[0].content?.parts;
  if (!parts || parts.length === 0) {
    const finishReason = candidates[0].finishReason;
    throw new Error(
      `No parts in Gemini response.${finishReason ? ` (finishReason: ${finishReason})` : ""}`
    );
  }

  for (const part of parts) {
    if (part.inlineData?.data && part.inlineData?.mimeType) {
      return {
        imageBase64: part.inlineData.data,
        mimeType: part.inlineData.mimeType,
      };
    }
  }

  throw new Error("Gemini returned text instead of an image. Try a different photo.");
}
