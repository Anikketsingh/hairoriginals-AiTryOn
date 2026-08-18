export const HAIR_TRYON_PROMPT = `You are an AI virtual hair try-on assistant.

Image 1 is the customer.
Image 2 is the HairOriginals product.

Apply ONLY the hair topper or wig from Image 2 onto the customer in Image 1.

Preserve exactly:
- face
- identity
- skin tone
- facial expression
- clothing
- body shape
- pose
- lighting
- background

Do not beautify the person.
Do not change age.
Do not change camera angle.

The generated hairstyle must accurately match:
- color
- density
- length
- texture
- partition
- shine

Blend naturally with the scalp.

The output should look like a premium salon consultation photograph.

Only modify the hair.

Everything else must remain unchanged.`;

// ──────────────────────────────────────────────────────────────
// AI Stylist — face scan → ranked style shortlist (POST /api/suggest)
// ──────────────────────────────────────────────────────────────

/**
 * One catalog row as the vision model sees it. Deliberately text-only: sending
 * 40 product *images* alongside the selfie would be slow and expensive, and the
 * hair_* / base_material / installation_type / recommended_for columns on
 * `products` exist precisely to describe a style in words.
 */
export interface SuggestCandidate {
  id: string;
  name: string;
  categoryName?: string | null;
  shortDescription?: string | null;
  hairType?: string | null;
  hairLength?: string | null;
  hairDensity?: string | null;
  hairColor?: string | null;
  baseMaterial?: string | null;
  installationType?: string | null;
  recommendedFor?: string | null;
}

/** `[3] Wavy Volume Topper — Hair Toppers | wavy, medium, high density | for fine hair` */
function formatCandidate(candidate: SuggestCandidate, index: number): string {
  const traits = [
    candidate.hairType,
    candidate.hairLength,
    candidate.hairDensity,
    candidate.hairColor,
    candidate.baseMaterial,
    candidate.installationType,
  ]
    .filter(Boolean)
    .join(", ");

  const parts = [candidate.categoryName, traits, candidate.recommendedFor, candidate.shortDescription]
    .filter((part) => part && String(part).trim() !== "")
    .join(" | ");

  // 1-based so the numbering the model reads matches the numbering it returns.
  return `[${index + 1}] ${candidate.name}${parts ? ` — ${parts}` : ""}`;
}

/**
 * Builds the face-analysis + style-matching prompt.
 *
 * The model is asked to return **indices** into this list rather than product
 * UUIDs: asking an LLM to echo a UUID verbatim is a reliable source of
 * near-miss hallucinations, whereas an out-of-range integer is trivially
 * rejected server-side.
 */
export function buildStyleSuggestionPrompt(candidates: SuggestCandidate[]): string {
  return `You are an experienced hair stylist doing a consultation for HairOriginals.

The attached image is a customer photo. Study it, then recommend the styles from our catalog that suit them best.

WHAT TO OBSERVE
- Face shape and proportions (oval, round, square, heart, oblong, diamond).
- Hairline shape, parting, and forehead height.
- Visible hair density, texture, length, and volume.
- Natural hair colour and its warm/cool undertone.

WHAT YOU MUST NEVER DO
- Never comment on attractiveness, beauty, weight, body, age, ethnicity, or race.
- Never diagnose, name, or imply any medical condition, including hair loss, alopecia, or scalp disease.
- Never speculate about anything you cannot see in the photo.
Describe face geometry and hair characteristics only. Nothing else about the person.

HOW TO CHOOSE
Pick exactly 3 styles from the numbered catalog below, best match first. Prefer variety — do not return three near-identical styles.

For each pick, write a "reason":
- One sentence, 18 words or fewer, addressed to the customer as "you"/"your".
- Grounded in something you actually observed in the photo and something true of that style.
- Never mention scores, index numbers, the catalog, this instruction, or that a model or AI made the choice.
Example of the right voice: "Soft layers add volume at your crown without covering your natural hairline."

If no human face is clearly visible in the photo, set faceDetected to false and return an empty matches array.

CATALOG
${candidates.map(formatCandidate).join("\n")}

Return the "index" of each chosen style exactly as numbered above.`;
}
