/**
 * lib/gemini-models.ts
 *
 * Catalog of the Gemini image models this app is allowed to run, plus the
 * latency/price facts the admin model picker shows beside each one.
 *
 * Deliberately separate from lib/gemini.ts: the model picker in Admin → AI
 * Configuration is a client component, and importing lib/gemini.ts there
 * would pull the whole @google/genai SDK into the browser bundle. Nothing
 * here touches the SDK or the DB, so both sides can import it freely.
 *
 * Prices are USD per generated 1K-resolution image, per
 * https://ai.google.dev/gemini-api/docs/pricing (checked 2026-08-05).
 * Latencies are the vendor's published figures, not measured here — treat
 * them as relative ordering rather than an SLA.
 */

export interface GeminiModelInfo {
  id: string;
  /** Google's product name — what their docs and pricing page call it. */
  label: string;
  /** One-liner shown under the label in the picker. */
  description: string;
  /** Typical end-to-end generation time, per the vendor's model page. */
  latency: string;
  pricePerImageUsd: number;
}

export const GEMINI_MODELS = [
  {
    id: "gemini-3.1-flash-lite-image",
    label: "Nano Banana 2 Lite",
    description:
      "Fastest and cheapest. Google builds this one for high-volume interactive use, which is exactly the try-on flow.",
    latency: "~4s",
    pricePerImageUsd: 0.0336,
  },
  {
    id: "gemini-3.1-flash-image",
    label: "Nano Banana 2",
    description:
      "Same family as Lite with more fidelity, at double the cost. Worth switching to if Lite loses hair detail.",
    latency: "~4-6s",
    pricePerImageUsd: 0.067,
  },
  {
    id: "gemini-3-pro-image",
    label: "Nano Banana Pro",
    description:
      "Highest quality, but slowest and priciest — and slow enough to risk the 45s generation timeout under load.",
    latency: "~15-25s",
    pricePerImageUsd: 0.134,
  },
] as const satisfies readonly GeminiModelInfo[];

export type GeminiModel = (typeof GEMINI_MODELS)[number]["id"];

export const ALLOWED_GEMINI_MODELS: readonly GeminiModel[] = GEMINI_MODELS.map(
  (m) => m.id
);

export const DEFAULT_GEMINI_MODEL: GeminiModel = "gemini-3.1-flash-lite-image";

export function isAllowedGeminiModel(value: string): value is GeminiModel {
  return GEMINI_MODELS.some((m) => m.id === value);
}

/** Catalog entry for a model id, or undefined if it isn't one we allow. */
export function getGeminiModelInfo(id: string): GeminiModelInfo | undefined {
  return GEMINI_MODELS.find((m) => m.id === id);
}
