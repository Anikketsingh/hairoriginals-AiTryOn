/**
 * GET /api/products/[id]/customization
 *
 * Returns the Hair Colour / Hair Length attributes + options this product
 * has opted into, grouped by attribute. Never a 404 — an unknown product, a
 * product with the feature disabled, or one with nothing attached all
 * resolve to `{ attributes: [] }`, which the customer app treats as "this
 * style has no customization step". `prompt_fragment` is deliberately never
 * included here; it's internal prompt engineering, not customer-facing copy.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";
import { isCustomizationEnabled } from "@/lib/settings";
import type { CustomizationAttribute, ProductCustomizationResponse } from "@/lib/types";

const EMPTY_RESPONSE: ProductCustomizationResponse = { attributes: [] };

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const globallyEnabled = await isCustomizationEnabled();
    if (!globallyEnabled) {
      return jsonWithCache(EMPTY_RESPONSE);
    }

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, customization_enabled")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (!product?.customization_enabled) {
      return jsonWithCache(EMPTY_RESPONSE);
    }

    const { data: rows, error } = await supabaseAdmin
      .from("product_customization_options")
      .select(
        "option:customization_options!inner(id, label, swatch_hex, image_url, display_order, is_active, attribute:customization_attributes!inner(key, label, ui_type, display_order, is_active))"
      )
      .eq("product_id", id);

    if (error || !rows) {
      console.error("[/api/products/[id]/customization] Fetch error:", error?.message);
      return jsonWithCache(EMPTY_RESPONSE);
    }

    type Row = {
      option: {
        id: string;
        label: string;
        swatch_hex: string | null;
        image_url: string | null;
        display_order: number;
        is_active: boolean;
        attribute: {
          key: string;
          label: string;
          ui_type: "swatch" | "chip" | "thumbnail";
          display_order: number;
          is_active: boolean;
        } | null;
      } | null;
    };

    const byAttribute = new Map<string, CustomizationAttribute>();
    const attributeOrder = new Map<string, number>();
    const optionOrder = new Map<string, number>();

    for (const row of rows as unknown as Row[]) {
      const option = row.option;
      const attribute = option?.attribute;
      if (!option || !attribute || !option.is_active || !attribute.is_active) continue;

      let entry = byAttribute.get(attribute.key);
      if (!entry) {
        entry = { key: attribute.key, label: attribute.label, ui_type: attribute.ui_type, options: [] };
        byAttribute.set(attribute.key, entry);
        attributeOrder.set(attribute.key, attribute.display_order);
      }
      entry.options.push({
        id: option.id,
        label: option.label,
        swatch_hex: option.swatch_hex,
        image_url: toPublicStorageUrl(option.image_url),
      });
      optionOrder.set(option.id, option.display_order);
    }

    const attributes = Array.from(byAttribute.values())
      .filter((a) => a.options.length > 0)
      .sort((a, b) => (attributeOrder.get(a.key) ?? 0) - (attributeOrder.get(b.key) ?? 0));

    for (const attribute of attributes) {
      attribute.options.sort((a, b) => (optionOrder.get(a.id) ?? 0) - (optionOrder.get(b.id) ?? 0));
    }

    return jsonWithCache({ attributes });
  } catch (err) {
    console.error("[/api/products/[id]/customization] Error:", err);
    return jsonWithCache(EMPTY_RESPONSE);
  }
}

function jsonWithCache(body: ProductCustomizationResponse) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
