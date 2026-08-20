"use client";

import { useEffect, useState, useCallback } from "react";
import { Sliders, Save, CheckCircle, Loader2, RefreshCw, Zap, ArrowLeftRight, Home, Clock } from "lucide-react";
import ModelPickerDialog from "@/components/admin/ModelPickerDialog";
import AdminImageUploader from "@/components/admin/AdminImageUploader";
import MaintenanceToggle from "@/components/admin/MaintenanceToggle";
import { DEFAULT_GEMINI_MODEL, getGeminiModelInfo } from "@/lib/gemini-models";
import { isPasswordProtectedSetting } from "@/lib/settings-keys";

export default function AIConfigPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

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
      // GET returns every settings row, including the ones behind the
      // maintenance password. Posting those back would 403 the whole save, and
      // they're owned by MaintenanceToggle anyway — so drop them here.
      const payload = Object.entries(settings)
        .filter(([key]) => !isPasswordProtectedSetting(key))
        .map(([key, value]) => ({ key, value }));
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

  const activeModel = (settings.gemini_model as string) ?? DEFAULT_GEMINI_MODEL;
  const activeModelInfo = getGeminiModelInfo(activeModel);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span className="text-xs">Loading AI Configuration…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">AI Configuration &amp; Funnel Levers</h1>
          <p className="text-xs text-white/50 mt-1">Configure model defaults, generation quotas, and gate messaging with zero code deployments.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-white font-semibold text-xs shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
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
        {/* Site-wide kill switch. Sits above everything else and saves itself —
            it carries the maintenance password, not the form's payload. */}
        <MaintenanceToggle />

        {/* Gemini AI Settings */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-5">
          <div className="flex items-center gap-2 pb-3 border-b border-white/8">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Gemini Model Parameters</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Model is picked from a vetted list rather than typed free-hand:
                an unrecognized id silently falls back to the default in
                lib/generation-queue.ts, which used to look like a working save. */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">Active Generation Model</label>
              <button
                type="button"
                onClick={() => setModelPickerOpen(true)}
                className="group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-left hover:border-amber-400/50 transition-colors"
              >
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-semibold text-white truncate">
                    {activeModelInfo?.label ?? activeModel}
                  </span>
                  <span className="flex items-center gap-2 text-[10px] text-white/40">
                    {activeModelInfo ? (
                      <>
                        <span className="flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-amber-400" />
                          {activeModelInfo.latency}
                        </span>
                        <span>${activeModelInfo.pricePerImageUsd.toFixed(4)} / image</span>
                      </>
                    ) : (
                      <span className="text-amber-400">Unrecognized — falls back to default</span>
                    )}
                  </span>
                </span>
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 text-white/30 group-hover:text-amber-400 transition-colors" />
              </button>
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
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-5">
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

        {/* Feature Flags */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-5">
          <div className="flex items-center gap-2 pb-3 border-b border-white/8">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Feature Flags</h2>
          </div>

          <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
            <div>
              <p className="text-xs font-semibold text-white">Hair Colour &amp; Length Customization</p>
              <p className="text-[10px] text-white/40 mt-0.5">
                Fleet-wide kill switch. Turning this off disables the customize step for every product, even ones
                with it enabled individually — no deploy required.
              </p>
            </div>
            <input
              type="checkbox"
              checked={(settings.customization_enabled as boolean) ?? true}
              onChange={(e) => updateField("customization_enabled", e.target.checked)}
              className="shrink-0 w-4 h-4 rounded bg-white/10"
            />
          </label>
        </div>

        {/* Home Trial Offer */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-5">
          <div className="flex items-center gap-2 pb-3 border-b border-white/8">
            <Home className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Home Trial Offer</h2>
          </div>

          <p className="text-[10px] text-white/40 -mt-2">
            Shown on the result screen after a try-on: a permanent inline card, plus a popup that fires at
            most once per browser session and only from the customer&apos;s Nth try-on onward.
          </p>

          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-white">Home Trial Offer Enabled</p>
                <p className="text-[10px] text-white/40 mt-0.5">
                  Master switch. Off removes both the inline card and the popup — the result screen goes
                  back to Shop this look / Try another style only.
                </p>
              </div>
              <input
                type="checkbox"
                checked={(settings.home_trial_enabled as boolean) ?? true}
                onChange={(e) => updateField("home_trial_enabled", e.target.checked)}
                className="shrink-0 w-4 h-4 rounded bg-white/10"
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-white">Timed Popup Enabled</p>
                <p className="text-[10px] text-white/40 mt-0.5">
                  Off keeps the inline card but stops the sheet from ever auto-opening.
                </p>
              </div>
              <input
                type="checkbox"
                checked={(settings.home_trial_popup_enabled as boolean) ?? true}
                onChange={(e) => updateField("home_trial_popup_enabled", e.target.checked)}
                className="shrink-0 w-4 h-4 rounded bg-white/10"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60">Booking Page URL</label>
            <input
              type="url"
              value={(settings.home_trial_url as string) ?? ""}
              onChange={(e) => updateField("home_trial_url", e.target.value)}
              placeholder="https://www.hairoriginals.com/pages/try-at-home-new"
              className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400/50"
            />
            <p className="text-[10px] text-white/30">
              Opens in a new tab. utm_source / utm_medium / utm_campaign are added automatically unless you
              put your own here — anything you set wins.
            </p>
          </div>

          {/* Two creatives: the banner has to match the catalogue the customer
              is browsing, or a men's-patch shopper gets a women's extensions ad. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AdminImageUploader
              label="Banner — Women"
              value={(settings.home_trial_image_women as string) ?? ""}
              onChange={(url) => updateField("home_trial_image_women", url)}
              placeholder="/home-trial-banner.jpg"
            />
            <AdminImageUploader
              label="Banner — Men (falls back to Women)"
              value={(settings.home_trial_image_men as string) ?? ""}
              onChange={(url) => updateField("home_trial_image_men", url)}
              placeholder="Leave empty to reuse the women banner"
            />
          </div>
          <p className="text-[10px] text-white/30 -mt-3">
            Square (1:1) artwork. The popup shows it full-bleed with no heading over it, so the pitch has to
            live in the image itself.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">CTA Label</label>
              <input
                type="text"
                value={(settings.home_trial_cta_label as string) ?? ""}
                onChange={(e) => updateField("home_trial_cta_label", e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">Audience</label>
              <select
                value={(settings.home_trial_audience as string) ?? "all"}
                onChange={(e) => updateField("home_trial_audience", e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              >
                <option value="all">Everyone</option>
                <option value="women">Women only</option>
                <option value="men">Men only</option>
              </select>
              <p className="text-[10px] text-white/30">Matched against the Women / Men catalogue toggle.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">Supporting Line</label>
              <input
                type="text"
                value={(settings.home_trial_subtext as string) ?? ""}
                onChange={(e) => updateField("home_trial_subtext", e.target.value)}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-white/60">Card Badge</label>
              <input
                type="text"
                value={(settings.home_trial_badge as string) ?? ""}
                onChange={(e) => updateField("home_trial_badge", e.target.value)}
                placeholder="At home"
                className="w-full md:w-40 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              />
              <p className="text-[10px] text-white/30">Leave empty to hide the pill.</p>
            </div>
          </div>

          <p className="text-[10px] text-amber-400/70 -mt-2">
            The home trial is a paid service — keep &quot;free&quot; out of all three fields above.
          </p>

          {/* Popup timing & frequency */}
          <div className="flex flex-col gap-4 pt-1 border-t border-white/8">
            <div className="flex items-center gap-2 pt-3">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <h3 className="text-[11px] font-bold text-white/80 uppercase tracking-wider">
                Popup Timing &amp; Frequency
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/60">Popup Delay (seconds)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={((settings.home_trial_delay_ms as number) ?? 4500) / 1000}
                  onChange={(e) =>
                    updateField("home_trial_delay_ms", Math.round(Number(e.target.value) * 1000))
                  }
                  className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
                />
                <p className="text-[10px] text-white/30">
                  Measured from the moment the result renders. The timer is dropped if she leaves the
                  result screen first, so it never opens over the style grid.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-white/60">Show From Try-On #</label>
                <input
                  type="number"
                  min={1}
                  value={(settings.home_trial_min_tryons as number) ?? 1}
                  onChange={(e) => updateField("home_trial_min_tryons", Number(e.target.value))}
                  className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
                />
                <p className="text-[10px] text-white/30">
                  1 pops on every result, including her first. 2 leaves the first result clean.
                </p>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-white">Only Once Per Browser Session</p>
                <p className="text-[10px] text-white/40 mt-0.5">
                  On, she sees it once no matter how many looks she tries. Off, it returns after every
                  result — more reach, more chance of wearing thin.
                </p>
              </div>
              <input
                type="checkbox"
                checked={(settings.home_trial_once_per_session as boolean) ?? false}
                onChange={(e) => updateField("home_trial_once_per_session", e.target.checked)}
                className="shrink-0 w-4 h-4 rounded bg-white/10"
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-white">Stop After She Books</p>
                <p className="text-[10px] text-white/40 mt-0.5">
                  Once she taps through to the booking page, stop auto-opening the popup on that device.
                  The inline card stays either way, so the path is never taken away.
                </p>
              </div>
              <input
                type="checkbox"
                checked={(settings.home_trial_stop_after_booking as boolean) ?? true}
                onChange={(e) => updateField("home_trial_stop_after_booking", e.target.checked)}
                className="shrink-0 w-4 h-4 rounded bg-white/10"
              />
            </label>
          </div>
        </div>
      </div>

      {modelPickerOpen && (
        <ModelPickerDialog
          onClose={() => setModelPickerOpen(false)}
          current={activeModel}
          onSwitched={(modelId) => updateField("gemini_model", modelId)}
        />
      )}
    </div>
  );
}
