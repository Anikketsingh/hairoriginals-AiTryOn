/**
 * GET /api/admin/analytics
 *
 * Computes funnel metrics and conversion rates across all stages.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    const [sessionsRes, genRes, usersRes, leadsRes] = await Promise.all([
      supabaseAdmin.from("device_sessions").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("generations").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supabaseAdmin.from("users").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("leads").select("id", { count: "exact", head: true }),
    ]);

    const totalSessions = sessionsRes.count ?? 0;
    const totalGenerations = genRes.count ?? 0;
    const totalUsers = usersRes.count ?? 0;
    const totalLeads = leadsRes.count ?? 0;

    const guestToGenRate = totalSessions > 0 ? ((totalGenerations / totalSessions) * 100).toFixed(1) : "0.0";
    const genToLoginRate = totalGenerations > 0 ? ((totalUsers / totalGenerations) * 100).toFixed(1) : "0.0";
    const stage3ToLeadRate = totalUsers > 0 ? ((totalLeads / totalUsers) * 100).toFixed(1) : "0.0";

    return NextResponse.json({
      totalSessions,
      totalGenerations,
      totalUsers,
      totalLeads,
      conversionRates: {
        guestToGenRate: Number(guestToGenRate),
        genToLoginRate: Number(genToLoginRate),
        stage3ToLeadRate: Number(stage3ToLeadRate),
      },
    });
  } catch (err) {
    console.error("[/api/admin/analytics] Error:", err);
    return NextResponse.json({ error: "Failed to compute funnel analytics." }, { status: 500 });
  }
}
