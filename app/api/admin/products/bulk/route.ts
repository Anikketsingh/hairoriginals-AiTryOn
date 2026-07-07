/**
 * POST /api/admin/products/bulk
 *
 * Executes bulk actions across multiple selected products (publish, archive, delete, change category/gender).
 * Body: { ids: string[], action: 'publish' | 'archive' | 'delete' | 'change_category' | 'change_gender', targetValue?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, action, targetValue } = body;

    if (!Array.isArray(ids) || ids.length === 0 || !action) {
      return NextResponse.json({ error: "Missing ids array or action type." }, { status: 400 });
    }

    if (action === "delete") {
      const { error } = await supabaseAdmin.from("products").delete().in("id", ids);
      if (error) return NextResponse.json({ error: "Failed to bulk delete products." }, { status: 500 });
      return NextResponse.json({ success: true, count: ids.length });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (action === "publish") updates.status = "published";
    if (action === "archive") updates.status = "archived";
    if (action === "change_category" && targetValue) updates.category_id = targetValue;
    if (action === "change_gender" && targetValue) updates.gender = targetValue;

    const { error: updErr } = await supabaseAdmin.from("products").update(updates).in("id", ids);

    if (updErr) {
      return NextResponse.json({ error: "Failed to execute bulk update." }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: ids.length });
  } catch (err) {
    console.error("[/api/admin/products/bulk] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
