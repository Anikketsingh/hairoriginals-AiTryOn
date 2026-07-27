/**
 * GET /api/admin/analytics
 *
 * Computes funnel metrics and conversion rates across all stages.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "content_manager"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const params = new URL(request.url).searchParams;
    const dateFrom = params.get("dateFrom")?.trim();
    const dateTo = params.get("dateTo")?.trim();
    const fromIso = dateFrom ? new Date(dateFrom).toISOString() : null;
    // dateTo comes in as a plain YYYY-MM-DD date — push to end of that day so
    // rows created on the "to" date itself are included.
    const toIso = (() => {
      if (!dateTo) return null;
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      return end.toISOString();
    })();

    // device_sessions has no created_at — first_seen is its creation timestamp.
    let sessionsQuery = supabaseAdmin.from("device_sessions").select("id", { count: "exact", head: true });
    let genQuery = supabaseAdmin.from("generations").select("id", { count: "exact", head: true }).eq("status", "completed");
    let usersQuery = supabaseAdmin.from("users").select("id", { count: "exact", head: true });
    let leadsQuery = supabaseAdmin.from("leads").select("id", { count: "exact", head: true });

    if (fromIso) {
      sessionsQuery = sessionsQuery.gte("first_seen", fromIso);
      genQuery = genQuery.gte("created_at", fromIso);
      usersQuery = usersQuery.gte("created_at", fromIso);
      leadsQuery = leadsQuery.gte("created_at", fromIso);
    }
    if (toIso) {
      sessionsQuery = sessionsQuery.lte("first_seen", toIso);
      genQuery = genQuery.lte("created_at", toIso);
      usersQuery = usersQuery.lte("created_at", toIso);
      leadsQuery = leadsQuery.lte("created_at", toIso);
    }

    const [sessionsRes, genRes, usersRes, leadsRes] = await Promise.all([
      sessionsQuery,
      genQuery,
      usersQuery,
      leadsQuery,
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
