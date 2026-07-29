/**
 * GET & POST /api/admin/customization/attributes
 *
 * Admin CRUD for the customization attribute library ("Hair Colour",
 * "Hair Length", and any future attribute like Hair Density). Options for
 * each attribute are managed separately via
 * /api/admin/customization/options.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

// Lowercase snake_case, matching the existing settings-key / category-slug
// convention elsewhere in the app — this value is a stable machine key
// (products.customization_enabled joins on it), not display copy.
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const createAttributeBodySchema = z.object({
  key: z.string().regex(KEY_PATTERN, "key must be lowercase snake_case, e.g. hair_density"),
  label: z.string().min(1, "label is required"),
  description: z.string().optional().nullable(),
  ui_type: z.enum(["swatch", "chip", "thumbnail"]).optional(),
  display_order: z.union([z.number(), z.string()]).optional(),
  is_active: z.boolean().optional(),
});

export async function GET() {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { data, error } = await supabaseAdmin
      .from("customization_attributes")
      .select("*, customization_options(count)")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("[/api/admin/customization/attributes GET] Error:", error.message);
      return NextResponse.json({ error: "Failed to fetch attributes." }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/admin/customization/attributes GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, createAttributeBodySchema);
    if (parsed.error) return parsed.error;
    const { key, label, description, ui_type, display_order, is_active } = parsed.data;

    const { data: attribute, error } = await supabaseAdmin
      .from("customization_attributes")
      .insert({
        key,
        label,
        description: description || null,
        ui_type: ui_type || "chip",
        display_order: Number(display_order) || 0,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error || !attribute) {
      const message = error?.code === "23505" ? "An attribute with this key already exists." : "Failed to create attribute.";
      console.error("[/api/admin/customization/attributes POST] Insert error:", error?.message);
      return NextResponse.json({ error: message }, { status: error?.code === "23505" ? 409 : 500 });
    }

    return NextResponse.json(attribute);
  } catch (err) {
    console.error("[/api/admin/customization/attributes POST] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
