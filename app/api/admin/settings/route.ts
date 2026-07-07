/**
 * GET / POST /api/admin/settings
 *
 * Manage platform settings stored in the `settings` table.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invalidateAllSettings } from "@/lib/settings";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("key, value, description")
      .order("key");

    if (error) {
      return NextResponse.json({ error: "Failed to fetch settings." }, { status: 500 });
    }

    // Convert rows array into key-value map
    const settingsMap: Record<string, unknown> = {};
    for (const row of data) {
      settingsMap[row.key] = row.value;
    }

    return NextResponse.json(settingsMap);
  } catch (err) {
    console.error("[/api/admin/settings GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const updates: { key: string; value: unknown }[] = body.settings;

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "Invalid payload format." }, { status: 400 });
    }

    for (const item of updates) {
      await supabaseAdmin
        .from("settings")
        .update({ value: item.value })
        .eq("key", item.key);
    }

    // Invalidate server-side cache so changes take immediate effect
    invalidateAllSettings();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/admin/settings POST] Error:", err);
    return NextResponse.json({ error: "Failed to update settings." }, { status: 500 });
  }
}
