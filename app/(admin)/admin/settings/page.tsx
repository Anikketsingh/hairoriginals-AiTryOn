"use client";

import { useEffect, useState, useCallback } from "react";
import { Sliders, Save, CheckCircle, Loader2, RefreshCw } from "lucide-react";

export default function AIConfigPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/admin/settings");
        if (res.ok) setSettings(await res.json());
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSuccess(false);
    try {
      const payload = Object.entries(settings).map(([key, value]) => ({ key, value }));
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: payload }),
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const updateField = (key: string, val: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span className="text-xs">Loading AI Configuration…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AI Configuration &amp; Funnel Levers</h1>
          <p className="text-xs text-white/50 mt-1">Configure model defaults, generation quotas, and gate messaging with zero code deployments.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-white font-semibold text-xs shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving Changes…" : "Save Configuration"}
        </button>
      </div>

      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <CheckCircle className="w-4 h-4" /> Configuration successfully updated and cache invalidated live!
        </div>
      )}

      {/* Form Sections */}
      <div className="flex flex-col gap-6">
        {/* Gemini AI Settings */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-6 flex flex-col gap-5">
          <div className="flex items-center gap-2 pb-3 border-b border-white/8">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Gemini Model Parameters</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">Gemini AI Model Identifier</label>
              <input
                type="text"
                value={(settings.gemini_model as string) ?? "gemini-3.1-flash-image"}
                onChange={(e) => updateField("gemini_model", e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">Max Upload File Size (MB)</label>
              <input
                type="number"
                value={(settings.max_upload_size_mb as number) ?? 10}
                onChange={(e) => updateField("max_upload_size_mb", Number(e.target.value))}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              />
            </div>
          </div>
        </div>

        {/* Funnel Quotas */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-6 flex flex-col gap-5">
          <div className="flex items-center gap-2 pb-3 border-b border-white/8">
            <RefreshCw className="w-4 h-4 text-rose-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Generation Funnel Quotas (§2)</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">Stage 0 Guest Free Quota (Try-ons)</label>
              <input
                type="number"
                value={(settings.guest_free_generations as number) ?? 1}
                onChange={(e) => updateField("guest_free_generations", Number(e.target.value))}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">Stage 2 Registered Account Bonus Quota</label>
              <input
                type="number"
                value={(settings.registered_bonus_generations as number) ?? 2}
                onChange={(e) => updateField("registered_bonus_generations", Number(e.target.value))}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">Stage 1 Login Gate Message</label>
              <textarea
                rows={2}
                value={(settings.login_gate_message as string) ?? ""}
                onChange={(e) => updateField("login_gate_message", e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">Stage 3 Agent Gate Message</label>
              <textarea
                rows={2}
                value={(settings.agent_gate_message as string) ?? ""}
                onChange={(e) => updateField("agent_gate_message", e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
