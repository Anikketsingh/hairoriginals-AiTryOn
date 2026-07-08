/**
 * GET / POST /api/admin/settings
 *
 * Manage platform settings stored in the `settings` table.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invalidateAllSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";

const bodySchema = z.object({
  settings: z.array(z.object({ key: z.string().min(1), value: z.unknown() })).min(1),
});

export async function GET() {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

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
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { settings: updates } = parsed.data;

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
