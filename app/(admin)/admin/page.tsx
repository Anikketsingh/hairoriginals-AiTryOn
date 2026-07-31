"use client";

import { useEffect, useState } from "react";
import { Users, Sparkles, CheckCircle, AlertTriangle, Package, MessageSquare, ArrowUpRight } from "lucide-react";

interface Metrics {
  totalUsers: number;
  totalGenerations: number;
  successfulGenerations: number;
  failedGenerations: number;
  totalProducts: number;
  totalLeads: number;
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch("/api/admin/metrics");
        if (res.ok) {
          setMetrics(await res.json());
        }
      } catch (err) {
        console.error("Failed to load metrics:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchMetrics();
  }, []);

  const cards = [
    { label: "Total Generations", value: metrics?.totalGenerations ?? 0, icon: Sparkles, color: "from-amber-400 to-orange-500" },
    { label: "Successful Try-Ons", value: metrics?.successfulGenerations ?? 0, icon: CheckCircle, color: "from-emerald-400 to-teal-500" },
    { label: "Stage 3 Qualified Leads", value: metrics?.totalLeads ?? 0, icon: MessageSquare, color: "from-rose-400 to-pink-500" },
    { label: "Catalog Products", value: metrics?.totalProducts ?? 0, icon: Package, color: "from-blue-400 to-indigo-500" },
    { label: "Registered Users", value: metrics?.totalUsers ?? 0, icon: Users, color: "from-purple-400 to-violet-500" },
    { label: "Failed Generations", value: metrics?.failedGenerations ?? 0, icon: AlertTriangle, color: "from-red-400 to-orange-600" },
  ];

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Executive Dashboard Overview</h1>
        <p className="text-xs text-white/50 mt-1">Real-time platform usage, AI model health, and funnel lead metrics.</p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="relative rounded-2xl bg-white/[0.03] border border-white/8 p-5 sm:p-6 flex flex-col justify-between overflow-hidden group hover:border-white/20 transition-all"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">{card.label}</span>
                <div className={`w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-black shadow-md`}>
                  <Icon className="w-5 h-5 stroke-[2.5]" />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {loading ? "…" : card.value.toLocaleString()}
                </span>
                <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-0.5">
                  Live <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Platform Architecture & Active Funnel Status */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-5 sm:p-6 flex flex-col gap-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Funnel &amp; AI Health Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-white/60">
          <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2">
            <span className="font-semibold text-amber-400">Current AI Model Engine</span>
            <p>Google Gemini 3.1 Flash Image (Asynchronous Queue Architecture)</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2">
            <span className="font-semibold text-rose-400">Active Gating Funnel</span>
            <p>Stage 0 (Guest: 1 Try) → Stage 1 (Phone OTP: +2 Bonus) → Stage 3 (Agent Lead Gate)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
