import { GoogleGenAI } from "@google/genai";
import { HAIR_TRYON_PROMPT } from "@/lib/prompt";

// Admin → AI Configuration lets an operator type in any model string; this
// allowlist is what actually gets used — an unrecognized value falls back
// to DEFAULT_GEMINI_MODEL rather than being passed straight through to the
// API (see lib/generation-queue.ts, which resolves the settings value
// against this before calling generateTryOn).
export const ALLOWED_GEMINI_MODELS = ["gemini-3.1-flash-image"] as const;
export type GeminiModel = (typeof ALLOWED_GEMINI_MODELS)[number];
export const DEFAULT_GEMINI_MODEL: GeminiModel = "gemini-3.1-flash-image";

export function isAllowedGeminiModel(value: string): value is GeminiModel {
  return (ALLOWED_GEMINI_MODELS as readonly string[]).includes(value);
}

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
    throw new Error("No candidates returned from Gemini API.");
  }

  const parts = candidates[0].content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error("No parts in Gemini response.");
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
