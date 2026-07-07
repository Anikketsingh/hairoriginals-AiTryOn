/**
 * GET / POST /api/admin/prompts
 *
 * Manage prompt templates stored in `prompt_templates`.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
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
  try {
    const body = await request.json();
    const { id, template } = body;

    if (!id || !template) {
      return NextResponse.json({ error: "Missing id or template." }, { status: 400 });
    }

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
