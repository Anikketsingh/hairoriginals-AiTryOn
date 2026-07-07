/**
 * GET /api/admin/metrics
 *
 * Returns aggregate metrics for the Admin Dashboard overview.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    const [usersRes, genRes, successRes, failedRes, prodRes, leadsRes] = await Promise.all([
      supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("generations").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("generations").select("*", { count: "exact", head: true }).eq("status", "completed"),
      supabaseAdmin.from("generations").select("*", { count: "exact", head: true }).eq("status", "failed"),
      supabaseAdmin.from("products").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("leads").select("*", { count: "exact", head: true }),
    ]);

    if (usersRes.error) console.error("[metrics] users error:", usersRes.error.message);
    if (genRes.error) console.error("[metrics] gen error:", genRes.error.message);

    return NextResponse.json({
      totalUsers: usersRes.count ?? 0,
      totalGenerations: genRes.count ?? 0,
      successfulGenerations: successRes.count ?? 0,
      failedGenerations: failedRes.count ?? 0,
      totalProducts: prodRes.count ?? 0,
      totalLeads: leadsRes.count ?? 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch metrics.";
    console.error("[/api/admin/metrics] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
