"use client";

import { useEffect, useState } from "react";
import { Coins, DollarSign, Download, Sparkles, CreditCard, Layers, Clock, AlertCircle, Loader2 } from "lucide-react";

interface CostsData {
  credits: {
    totalGranted: number;
    totalConsumed: number;
    totalRemaining: number;
    splits: Record<string, { granted: number; consumed: number }>;
  };
  generations: {
    total: number;
    completed: number;
    failed: number;
    avgDurationSeconds: number;
    estimatedCostINR: number;
  };
  recentGrants: any[];
  recentGenerations: any[];
}

export default function AICostsPage() {
  const [data, setData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCostsData() {
      try {
        const res = await fetch("/api/admin/costs");
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch costs data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCostsData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span className="text-xs">Loading Costs &amp; Credits Dashboard…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
        <AlertCircle className="w-4 h-4 text-red-400" />
        <span>Failed to load cost analytics data. Please try again later.</span>
      </div>
    );
  }

  const creditSourceLabels: Record<string, string> = {
    guest_free: "Guest Free (Stage 0)",
    registered_bonus: "OTP Signup Bonus (Stage 2)",
    agent_grant: "Agent Manual Grant (Stage 4)",
    promo: "Campaigns & Promos",
    monthly_refresh: "Monthly Recurring",
  };

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">AI Credits &amp; Costs</h1>
          <p className="text-xs text-white/50 mt-1">Audit generation spend, credits distribution ledger, and export logs.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:items-center gap-2 sm:gap-3 shrink-0">
          <a
            href="/api/admin/costs/export?type=generations"
            className="flex items-center justify-center gap-2 px-4 py-3 md:py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all"
          >
            <Download className="w-3.5 h-3.5 shrink-0" /> Export Try-Ons (CSV)
          </a>
          <a
            href="/api/admin/costs/export?type=credits"
            className="flex items-center justify-center gap-2 px-4 py-3 md:py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 hover:scale-[1.02] active:scale-[0.98] text-white text-xs font-bold transition-all shadow-lg shadow-orange-500/10"
          >
            <Download className="w-3.5 h-3.5 shrink-0" /> Export Credits Ledger (CSV)
          </a>
        </div>
      </div>

      {/* Main KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: Estimated Cost */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-5 sm:p-6 flex flex-col justify-between overflow-hidden group hover:border-white/20 transition-all">
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Estimated AI Spend</span>
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-black shadow-md">
              <span className="text-sm font-bold">₹</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight break-words">
              ₹{data.generations.estimatedCostINR.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-white/40">
              Based on ₹5.00 per completed image try-on
            </span>
          </div>
        </div>

        {/* Card 2: Credits Remaining */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-5 sm:p-6 flex flex-col justify-between overflow-hidden group hover:border-white/20 transition-all">
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Credits Status</span>
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black shadow-md">
              <Coins className="w-5 h-5 stroke-[2.5]" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {data.credits.totalRemaining.toLocaleString()}
              </span>
              <span className="text-xs text-white/40">
                / {data.credits.totalGranted.toLocaleString()} granted
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-rose-500 rounded-full"
                style={{
                  width: `${data.credits.totalGranted > 0 ? (data.credits.totalRemaining / data.credits.totalGranted) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Metrics summary */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-5 sm:p-6 flex flex-col justify-between overflow-hidden group hover:border-white/20 transition-all sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Try-on Performance</span>
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-black shadow-md">
              <Sparkles className="w-5 h-5 stroke-[2.5]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white">{data.generations.completed.toLocaleString()}</span>
              <span className="text-[10px] text-white/40">Successful</span>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white">{data.generations.avgDurationSeconds}s</span>
              <span className="text-[10px] text-white/40">Avg Generation</span>
            </div>
          </div>
        </div>
      </div>

      {/* Credit Ledger Allocation Breakdown */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 shrink-0 text-amber-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Credit Grants Distribution</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          {Object.entries(data.credits.splits).map(([source, split]) => (
            <div key={source} className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider truncate block" title={creditSourceLabels[source] || source}>
                {creditSourceLabels[source] || source}
              </span>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-white">{split.granted.toLocaleString()}</span>
                <span className="text-[10px] text-white/40">
                  {split.consumed.toLocaleString()} consumed ({split.granted > 0 ? ((split.consumed / split.granted) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tables showing detail logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
        {/* Recent credit grants */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-4 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 shrink-0 text-amber-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Recent Credit Transactions</h2>
            </div>
          </div>

          {/* Five columns don't fit a phone — the table scrolls sideways inside the card */}
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[520px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-white/50 font-bold">
                  <th className="pb-3 pr-2">User / Target</th>
                  <th className="pb-3 px-2">Source</th>
                  <th className="pb-3 px-2">Amount</th>
                  <th className="pb-3 px-2">Issued By</th>
                  <th className="pb-3 pl-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentGrants.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-white/30">No transactions recorded.</td>
                  </tr>
                ) : (
                  data.recentGrants.map((grant) => (
                    <tr key={grant.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pr-2 font-medium">
                        {grant.user ? (
                          <div className="flex flex-col">
                            <span>{grant.user.name || "Unnamed User"}</span>
                            <span className="text-[10px] text-white/40 font-mono">{grant.user.phone}</span>
                          </div>
                        ) : (
                          <span className="text-white/40">Anonymous Guest</span>
                        )}
                      </td>
                      <td className="py-3 px-2 capitalize text-white/70">
                        {grant.source.replace("_", " ")}
                      </td>
                      <td className="py-3 px-2 font-bold text-emerald-400">
                        +{grant.amount}
                      </td>
                      <td className="py-3 px-2 text-white/60">
                        {grant.admin ? grant.admin.name : "System"}
                      </td>
                      <td className="py-3 pl-2 text-white/40">
                        {new Date(grant.granted_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent generations list */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-4 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0 text-rose-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Recent AI Try-Ons</h2>
            </div>
          </div>

          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[520px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-white/50 font-bold">
                  <th className="pb-3 pr-2">User</th>
                  <th className="pb-3 px-2">Status</th>
                  <th className="pb-3 px-2">Model</th>
                  <th className="pb-3 px-2">Duration</th>
                  <th className="pb-3 pl-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recentGenerations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-white/30">No generations recorded.</td>
                  </tr>
                ) : (
                  data.recentGenerations.map((gen) => (
                    <tr key={gen.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pr-2 font-medium">
                        {gen.user ? (
                          <div className="flex flex-col">
                            <span>{gen.user.name || "Unnamed User"}</span>
                            <span className="text-[10px] text-white/40 font-mono">{gen.user.phone}</span>
                          </div>
                        ) : (
                          <span className="text-white/40">Anonymous Guest</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            gen.status === "completed"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : gen.status === "failed"
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                          title={gen.status === "failed" ? gen.error_log ?? undefined : undefined}
                        >
                          {gen.status}
                        </span>
                        {gen.status === "failed" && gen.error_log && (
                          <div className="mt-1 max-w-[220px] truncate text-[10px] text-red-300/70" title={gen.error_log}>
                            {gen.error_log}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-white/60 font-mono text-[10px]">
                        {gen.model || "—"}
                      </td>
                      <td className="py-3 px-2 text-white/70">
                        {gen.duration_ms ? `${(gen.duration_ms / 1000).toFixed(1)}s` : "N/A"}
                      </td>
                      <td className="py-3 pl-2 text-white/40">
                        {new Date(gen.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
