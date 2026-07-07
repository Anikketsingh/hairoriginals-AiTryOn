import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    // 1. Fetch total credits and consumed split by source
    const { data: creditsData, error: creditsErr } = await supabaseAdmin
      .from("generation_credits")
      .select("source, amount, consumed");

    if (creditsErr) {
      console.error("[api/admin/costs] credits error:", creditsErr.message);
      return NextResponse.json({ error: "Failed to fetch credits metrics" }, { status: 500 });
    }

    // 2. Fetch total generations count grouped by status
    const { data: generationsData, error: genErr } = await supabaseAdmin
      .from("generations")
      .select("status, duration_ms");

    if (genErr) {
      console.error("[api/admin/costs] generations error:", genErr.message);
      return NextResponse.json({ error: "Failed to fetch generations metrics" }, { status: 500 });
    }

    // Process credits
    let totalGranted = 0;
    let totalConsumed = 0;
    const sourceSplits: Record<string, { granted: number; consumed: number }> = {
      guest_free: { granted: 0, consumed: 0 },
      registered_bonus: { granted: 0, consumed: 0 },
      agent_grant: { granted: 0, consumed: 0 },
      promo: { granted: 0, consumed: 0 },
      monthly_refresh: { granted: 0, consumed: 0 },
    };

    creditsData?.forEach((c) => {
      totalGranted += c.amount;
      totalConsumed += c.consumed;
      if (sourceSplits[c.source]) {
        sourceSplits[c.source].granted += c.amount;
        sourceSplits[c.source].consumed += c.consumed;
      }
    });

    const totalRemaining = totalGranted - totalConsumed;

    // Process generations
    let totalGenerations = 0;
    let completedGenerations = 0;
    let failedGenerations = 0;
    let totalDurationMs = 0;

    generationsData?.forEach((g) => {
      totalGenerations++;
      if (g.status === "completed") completedGenerations++;
      else if (g.status === "failed") failedGenerations++;
      totalDurationMs += g.duration_ms ?? 0;
    });

    const avgDurationSeconds = completedGenerations > 0 ? (totalDurationMs / completedGenerations / 1000).toFixed(2) : "0.00";

    // Cost per image generation is ₹5.00 INR
    const costPerGenINR = 5.00;
    const estimatedCostINR = completedGenerations * costPerGenINR;

    // Fetch last 10 credit grants for log
    const { data: recentGrants } = await supabaseAdmin
      .from("generation_credits")
      .select("*, user:users(phone, name), admin:admin_users(email, name)")
      .order("granted_at", { ascending: false })
      .limit(10);

    // Fetch last 10 generations for log
    const { data: recentGenerations } = await supabaseAdmin
      .from("generations")
      .select("*, user:users(phone, name)")
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      credits: {
        totalGranted,
        totalConsumed,
        totalRemaining,
        splits: sourceSplits,
      },
      generations: {
        total: totalGenerations,
        completed: completedGenerations,
        failed: failedGenerations,
        avgDurationSeconds: Number(avgDurationSeconds),
        estimatedCostINR,
      },
      recentGrants: recentGrants || [],
      recentGenerations: recentGenerations || [],
    });
  } catch (err: any) {
    console.error("Costs route error:", err);
    return NextResponse.json({ error: err.message || "An unexpected error occurred" }, { status: 500 });
  }
}
