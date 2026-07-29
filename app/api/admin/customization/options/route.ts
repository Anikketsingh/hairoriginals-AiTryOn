/**
 * GET & POST /api/admin/customization/options
 *
 * Admin CRUD for the shared option library (e.g. "Jet Black" under Hair
 * Colour). Query param:
 *   - attribute_id: filter to one attribute's options
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const VALUE_PATTERN = /^[a-z][a-z0-9_]*$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

// prompt_fragment is concatenated straight into the Gemini prompt for every
// generation of every product this option is attached to — an unbounded
// field lets one bad edit blow up a lot of generations at once.
const PROMPT_FRAGMENT_MAX_LENGTH = 500;

const createOptionBodySchema = z.object({
  attribute_id: z.string().uuid(),
  value: z.string().regex(VALUE_PATTERN, "value must be lowercase snake_case, e.g. jet_black"),
  label: z.string().min(1, "label is required"),
  swatch_hex: z.string().regex(HEX_PATTERN, "swatch_hex must look like #RRGGBB").optional().or(z.literal("")).nullable(),
  image_url: z.string().trim().url().optional().or(z.literal("")).nullable(),
  prompt_fragment: z.string().min(1, "prompt_fragment is required").max(PROMPT_FRAGMENT_MAX_LENGTH),
  display_order: z.union([z.number(), z.string()]).optional(),
  is_active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const attributeId = new URL(request.url).searchParams.get("attribute_id");

    let query = supabaseAdmin
      .from("customization_options")
      .select("*")
      .order("display_order", { ascending: true });

    if (attributeId) {
      query = query.eq("attribute_id", attributeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[/api/admin/customization/options GET] Error:", error.message);
      return NextResponse.json({ error: "Failed to fetch options." }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/admin/customization/options GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, createOptionBodySchema);
    if (parsed.error) return parsed.error;
    const { attribute_id, value, label, swatch_hex, image_url, prompt_fragment, display_order, is_active } = parsed.data;

    const { data: option, error } = await supabaseAdmin
      .from("customization_options")
      .insert({
        attribute_id,
        value,
        label,
        swatch_hex: swatch_hex || null,
        image_url: image_url || null,
        prompt_fragment,
        display_order: Number(display_order) || 0,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error || !option) {
      const message = error?.code === "23505" ? "An option with this value already exists for this attribute." : "Failed to create option.";
      console.error("[/api/admin/customization/options POST] Insert error:", error?.message);
      return NextResponse.json({ error: message }, { status: error?.code === "23505" ? 409 : 500 });
    }

    return NextResponse.json(option);
  } catch (err) {
    console.error("[/api/admin/customization/options POST] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
