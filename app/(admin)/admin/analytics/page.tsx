"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, TrendingUp, Users, Sparkles, MessageSquare, Loader2 } from "lucide-react";

interface AnalyticsData {
  totalSessions: number;
  totalGenerations: number;
  totalUsers: number;
  totalLeads: number;
  conversionRates: {
    guestToGenRate: number;
    genToLoginRate: number;
    stage3ToLeadRate: number;
  };
}

export default function FunnelAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchAnalytics = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const qs = params.toString();
      const res = await fetch(`/api/admin/analytics${qs ? `?${qs}` : ""}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(() => fetchAnalytics(), 300);
    return () => clearTimeout(t);
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span className="text-xs">Computing Funnel Analytics…</span>
      </div>
    );
  }

  const stages = [
    { name: "Stage 0: Guest Visit", count: data?.totalSessions ?? 0, desc: "Total anonymous device sessions initiated" },
    { name: "Stage 1: Guest Try-On", count: data?.totalGenerations ?? 0, desc: "Completed free try-on generations", rate: `${data?.conversionRates.guestToGenRate ?? 0}% conversion` },
    { name: "Stage 2: Phone Sign-In", count: data?.totalUsers ?? 0, desc: "Converted registered user accounts", rate: `${data?.conversionRates.genToLoginRate ?? 0}% conversion` },
    { name: "Stage 3: Stylist Lead", count: data?.totalLeads ?? 0, desc: "High-intent CRM sales leads generated", rate: `${data?.conversionRates.stage3ToLeadRate ?? 0}% conversion` },
  ];

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Gating Funnel Conversion Analytics</h1>
        <p className="text-xs text-white/50 mt-1">Detailed breakdown of customer drop-offs and stage-by-stage conversion performance (§2, §7).</p>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="analytics-date-from" className="text-[11px] text-white/50">From</label>
          <input
            id="analytics-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            max={dateTo || undefined}
            className="rounded-lg border border-white/10 bg-white/5 py-2 px-2.5 text-[11px] text-white focus:border-amber-400/50 focus:outline-none [color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="analytics-date-to" className="text-[11px] text-white/50">To</label>
          <input
            id="analytics-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom || undefined}
            className="rounded-lg border border-white/10 bg-white/5 py-2 px-2.5 text-[11px] text-white focus:border-amber-400/50 focus:outline-none [color-scheme:dark]"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="text-[10px] text-white/40 hover:text-white/70"
          >
            Clear date filter
          </button>
        )}
      </div>

      {/* Conversion Funnel Pipeline Cards */}
      <div className="flex flex-col gap-4">
        {stages.map((st, idx) => (
          <div key={idx} className="relative rounded-2xl bg-white/[0.03] border border-white/8 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/20 to-rose-500/20 border border-white/10 flex items-center justify-center font-bold text-amber-400 text-sm">
                S{idx}
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">{st.name}</h2>
                <p className="text-xs text-white/40 mt-0.5">{st.desc}</p>
              </div>
            </div>

            <div className="flex items-baseline gap-4">
              <span className="text-2xl font-bold text-white">{st.count.toLocaleString()}</span>
              {st.rate && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                  {st.rate}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary insights */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Funnel Conversion Insights</span>
        </div>
        <p className="text-xs text-white/60 leading-relaxed">
          The Stage 1 Phone OTP gate successfully captures user phone numbers after their very first free try-on. Sales agents receive qualified high-intent customer leads at Stage 3 with full access to the customer&apos;s generated try-on history.
        </p>
      </div>
    </div>
  );
}
