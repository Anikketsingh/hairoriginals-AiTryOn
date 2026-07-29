/**
 * PUT & DELETE /api/admin/customization/attributes/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const updateAttributeBodySchema = z.object({
  label: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  ui_type: z.enum(["swatch", "chip", "thumbnail"]).optional(),
  display_order: z.union([z.number(), z.string()]).optional(),
  is_active: z.boolean().optional(),
});

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const parsed = await parseJsonBody(request, updateAttributeBodySchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const update: Record<string, unknown> = {};
    if (body.label !== undefined) update.label = body.label;
    if (body.description !== undefined) update.description = body.description || null;
    if (body.ui_type !== undefined) update.ui_type = body.ui_type;
    if (body.display_order !== undefined) update.display_order = Number(body.display_order) || 0;
    if (body.is_active !== undefined) update.is_active = body.is_active;

    const { data: attribute, error } = await supabaseAdmin
      .from("customization_attributes")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error || !attribute) {
      console.error("[/api/admin/customization/attributes/[id] PUT] Error:", error?.message);
      return NextResponse.json({ error: "Failed to update attribute." }, { status: 500 });
    }

    return NextResponse.json(attribute);
  } catch (err) {
    console.error("[/api/admin/customization/attributes/[id] PUT] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await ctx.params;
    const cascade = new URL(request.url).searchParams.get("cascade") === "true";

    const { count } = await supabaseAdmin
      .from("customization_options")
      .select("id", { count: "exact", head: true })
      .eq("attribute_id", id);

    if (!cascade && count && count > 0) {
      return NextResponse.json(
        {
          error: `This attribute has ${count} option(s). Pass ?cascade=true to delete the attribute and all of its options.`,
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.from("customization_attributes").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to delete attribute." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/admin/customization/attributes/[id] DELETE] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
