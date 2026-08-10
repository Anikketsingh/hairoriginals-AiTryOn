import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCostsAccess } from "@/lib/admin-auth";
import { getGeminiModelInfo } from "@/lib/gemini-models";

export async function GET() {
  const admin = await requireCostsAccess();
  if (admin instanceof NextResponse) return admin;

  try {
    // 1. Fetch total credits and consumed split by source
    const { data: creditsData, error: creditsErr } = await supabaseAdmin
      .from("generation_credits")
      .select("source, amount, consumed");

    if (creditsErr) {
      console.error("[api/admin/costs] credits error:", creditsErr.message);
      return NextResponse.json({ error: "Failed to fetch credits metrics" }, { status: 500 });
    }

    // 2. Fetch total generations count grouped by status. `model` is needed to
    //    cost each generation at the rate of the model that actually ran —
    //    the model is admin-configurable and the three options differ 4x in
    //    price (see lib/gemini-models.ts).
    const { data: generationsData, error: genErr } = await supabaseAdmin
      .from("generations")
      .select("status, duration_ms, model");

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

    // Cost is accumulated per model rather than at one flat rate. The previous
    // `completed * ₹5.00` contradicted the app's own data: lib/gemini-models.ts
    // prices the three selectable models at $0.0336 / $0.067 / $0.134 per
    // image — a 4x spread — and the model is admin-configurable, so a single
    // constant could not be right for more than one configuration.
    const costByModel: Record<string, { count: number; usd: number }> = {};
    let estimatedCostUsd = 0;
    let uncostedGenerations = 0;

    generationsData?.forEach((g) => {
      totalGenerations++;
      if (g.status === "completed") completedGenerations++;
      else if (g.status === "failed") failedGenerations++;
      totalDurationMs += g.duration_ms ?? 0;

      // Only completed generations bill — a failed call produces no image.
      if (g.status !== "completed") return;

      const info = g.model ? getGeminiModelInfo(g.model) : undefined;
      if (!info) {
        // Historic rows predating the model column, or a model since removed
        // from the catalog. Surfaced rather than silently priced at zero.
        uncostedGenerations++;
        return;
      }
      const bucket = (costByModel[info.label] ??= { count: 0, usd: 0 });
      bucket.count++;
      bucket.usd += info.pricePerImageUsd;
      estimatedCostUsd += info.pricePerImageUsd;
    });

    const avgDurationSeconds = completedGenerations > 0 ? (totalDurationMs / completedGenerations / 1000).toFixed(2) : "0.00";

    // Fetch last 10 credit grants for log
    const { data: recentGrants } = await supabaseAdmin
      .from("generation_credits")
      .select("*, user:users(phone, name), admin:admin_users(email, name)")
      .order("granted_at", { ascending: false })
      .limit(10);

    // Fetch last 10 generations for log — explicit columns, not `*`, since
    // generations also holds the (unused-going-forward) result_image_base64
    // column; no reason to pull that into an admin dashboard payload.
    const { data: recentGenerations } = await supabaseAdmin
      .from("generations")
      .select("id, status, model, duration_ms, error_log, created_at, completed_at, user:users(phone, name)")
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
        // USD because that is the currency Google actually bills in. Reporting
        // a derived INR figure would bake in a stale FX rate.
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
        costByModel,
        uncostedGenerations,
      },
      recentGrants: recentGrants || [],
      recentGenerations: recentGenerations || [],
    });
  } catch (err: any) {
    console.error("Costs route error:", err);
    return NextResponse.json({ error: err.message || "An unexpected error occurred" }, { status: 500 });
  }
}
