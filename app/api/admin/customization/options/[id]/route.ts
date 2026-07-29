/**
 * PUT & DELETE /api/admin/customization/options/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const PROMPT_FRAGMENT_MAX_LENGTH = 500;

const updateOptionBodySchema = z.object({
  label: z.string().min(1).optional(),
  swatch_hex: z.string().regex(HEX_PATTERN, "swatch_hex must look like #RRGGBB").optional().or(z.literal("")).nullable(),
  image_url: z.string().trim().url().optional().or(z.literal("")).nullable(),
  prompt_fragment: z.string().min(1).max(PROMPT_FRAGMENT_MAX_LENGTH).optional(),
  display_order: z.union([z.number(), z.string()]).optional(),
  is_active: z.boolean().optional(),
});

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const parsed = await parseJsonBody(request, updateOptionBodySchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const update: Record<string, unknown> = {};
    if (body.label !== undefined) update.label = body.label;
    if (body.swatch_hex !== undefined) update.swatch_hex = body.swatch_hex || null;
    if (body.image_url !== undefined) update.image_url = body.image_url || null;
    if (body.prompt_fragment !== undefined) update.prompt_fragment = body.prompt_fragment;
    if (body.display_order !== undefined) update.display_order = Number(body.display_order) || 0;
    if (body.is_active !== undefined) update.is_active = body.is_active;

    const { data: option, error } = await supabaseAdmin
      .from("customization_options")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error || !option) {
      console.error("[/api/admin/customization/options/[id] PUT] Error:", error?.message);
      return NextResponse.json({ error: "Failed to update option." }, { status: 500 });
    }

    return NextResponse.json(option);
  } catch (err) {
    console.error("[/api/admin/customization/options/[id] PUT] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const { error } = await supabaseAdmin.from("customization_options").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to delete option." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/admin/customization/options/[id] DELETE] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
