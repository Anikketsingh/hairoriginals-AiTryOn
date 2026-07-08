/**
 * GET / POST /api/admin/prompts
 *
 * Manage prompt templates stored in `prompt_templates`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const bodySchema = z.object({
  id: z.string().uuid("id must be a valid template ID."),
  template: z.string().min(1, "Missing template."),
});

export async function GET() {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { data, error } = await supabaseAdmin
      .from("prompt_templates")
      .select("*")
      .order("slug");

    if (error) {
      return NextResponse.json({ error: "Failed to fetch prompt templates." }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/admin/prompts GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { id, template } = parsed.data;

    // Increment version upon update
    const { data: current } = await supabaseAdmin
      .from("prompt_templates")
      .select("version")
      .eq("id", id)
      .single();

    const newVersion = (current?.version ?? 1) + 1;

    const { data, error } = await supabaseAdmin
      .from("prompt_templates")
      .update({
        template,
        version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update prompt template." }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/admin/prompts POST] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
