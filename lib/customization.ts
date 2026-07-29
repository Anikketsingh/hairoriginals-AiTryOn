/**
 * lib/customization.ts
 *
 * Per-product Hair Colour / Hair Length customization. Options live in a
 * shared library (customization_options) that products attach to via
 * product_customization_options — see
 * supabase/migrations/20260729000001_product_customization.sql.
 *
 * Server-only — imports lib/supabase/server.ts.
 */

import { supabaseAdmin } from "@/lib/supabase/server";

export interface ResolvedCustomization {
  attribute_key: string;
  attribute_label: string;
  option_id: string;
  option_label: string;
  prompt_fragment: string;
}

/**
 * Composes the final prompt sent to Gemini. Returns `base` completely
 * unchanged when there are no selections — this is what guarantees the
 * prompt for every non-customized generation is byte-identical to today's.
 *
 * Two things this block has to survive, both learned the hard way:
 *
 * 1. It cannot borrow vocabulary from the base prompt. The base may be a
 *    prompt_templates row or a per-product prompt_override, and those use
 *    whatever wording their author chose ("the input selfie", "the customer
 *    portrait", "the reference image"). An earlier version anchored to
 *    "Image 1"/"Image 2", terms no base prompt actually defines, so the
 *    anchor bound to nothing. Positional wording ("the FIRST input image")
 *    is self-defining and matches the real part order in lib/gemini.ts,
 *    where the person is sent before the product.
 *
 * 2. It has to win an explicit contradiction. Product overrides commonly
 *    pin the very attributes being customized — one production override
 *    says "automatically match the wig color to the person's existing
 *    natural hair color" and fixes the length at "slightly below the
 *    shoulders". Faced with two irreconcilable orders the model resolved
 *    them by abandoning the try-on and returning the style reference photo
 *    instead. Hence the explicit supersede clause, and the closing sentence
 *    that pins the output canvas back to the customer.
 */
export function composeCustomizedPrompt(base: string, selections: ResolvedCustomization[]): string {
  if (selections.length === 0) return base;
  const lines = selections.map((s) => `- ${s.attribute_label}: ${s.prompt_fragment}`);
  return [
    base,
    "",
    "CUSTOMER-SELECTED ADJUSTMENTS (these override any conflicting instruction above):",
    ...lines,
    "",
    "Apply these adjustments to the hair on the person in the FIRST input image. If any instruction above tells you to match, preserve, or copy the person's existing hair colour, or to keep the colour or length shown in the SECOND input image, disregard that instruction — the adjustments listed here take precedence over it.",
    "",
    "The final output must be the person from the FIRST input image, with their face, identity, skin tone, expression, pose, camera angle, clothing, accessories, and background exactly unchanged. Only the hair may differ. The SECOND input image supplies the hairstyle shape only — never output it, and never copy its model, clothing, or background.",
  ].join("\n");
}

interface ProductCustomizationOptionRow {
  option_id: string;
  option: {
    id: string;
    label: string;
    prompt_fragment: string;
    is_active: boolean;
    attribute: {
      key: string;
      label: string;
      is_active: boolean;
    } | null;
  } | null;
}

/**
 * Re-resolves client-supplied option ids against what this product actually
 * offers. An id that isn't attached to `productId`, or whose option or
 * attribute is inactive, is silently dropped — the client sends only ids;
 * it can never inject prompt text directly. At most one option survives per
 * attribute: later entries in `optionIds` win, so a client sending two
 * colours ends up with just the last one.
 *
 * Never throws — a resolution failure returns an empty array so a bad
 * customization can't fail an otherwise-valid, already-paid-for generation.
 */
export async function resolveProductCustomizations(
  productId: string,
  optionIds: string[]
): Promise<ResolvedCustomization[]> {
  if (optionIds.length === 0) return [];

  try {
    const { data, error } = await supabaseAdmin
      .from("product_customization_options")
      .select(
        "option_id, option:customization_options!inner(id, label, prompt_fragment, is_active, attribute:customization_attributes!inner(key, label, is_active))"
      )
      .eq("product_id", productId)
      .in("option_id", optionIds);

    if (error || !data) {
      console.warn("[customization] Failed to resolve options:", error?.message ?? "no data");
      return [];
    }

    const rowsById = new Map(
      (data as unknown as ProductCustomizationOptionRow[]).map((row) => [row.option_id, row])
    );

    const byAttribute = new Map<string, ResolvedCustomization>();
    for (const id of optionIds) {
      const option = rowsById.get(id)?.option;
      const attribute = option?.attribute;
      if (!option || !attribute || !option.is_active || !attribute.is_active) continue;

      byAttribute.set(attribute.key, {
        attribute_key: attribute.key,
        attribute_label: attribute.label,
        option_id: option.id,
        option_label: option.label,
        prompt_fragment: option.prompt_fragment,
      });
    }

    return Array.from(byAttribute.values());
  } catch (err) {
    console.warn("[customization] Failed to resolve options:", err instanceof Error ? err.message : err);
    return [];
  }
}
