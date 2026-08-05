"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Zap, Loader2, AlertTriangle } from "lucide-react";
import { GEMINI_MODELS, type GeminiModelInfo } from "@/lib/gemini-models";

interface ModelPickerDialogProps {
  onClose: () => void;
  /** Model id currently persisted in the `gemini_model` setting. */
  current: string;
  /** Called with the new id once the switch has been saved successfully. */
  onSwitched: (modelId: string) => void;
}

/**
 * Model switcher for Admin → AI Configuration.
 *
 * Saves on its own rather than deferring to the page's "Save Configuration"
 * button: the POST carries only `gemini_model`, so any other unsaved edits on
 * the settings form are left untouched, and the operator gets an immediate
 * confirmation that generation traffic has actually moved.
 *
 * Rendered only while open (the parent gates it), so `selected` re-seeds from
 * `current` on every mount and a cancelled edit never leaks into the next open.
 */
export default function ModelPickerDialog({
  onClose,
  current,
  onSwitched,
}: ModelPickerDialogProps) {
  const [selected, setSelected] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    const t = window.setTimeout(() => panelRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // The parent only mounts this after a click, so there is no SSR pass to
  // mismatch against — but document still must exist before portalling.
  if (typeof document === "undefined") return null;

  const handleApply = async () => {
    if (selected === current) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: [{ key: "gemini_model", value: selected }],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      onSwitched(selected);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch model.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Switch generation model"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full sm:max-w-2xl max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#12121a] border border-white/10 shadow-2xl outline-none"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 bg-[#12121a] border-b border-white/8">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Switch Generation Model
            </h2>
            <p className="text-[11px] text-white/45 mt-1">
              Applies to every new try-on within 60s. In-flight jobs finish on the old model.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 flex flex-col gap-2.5">
          {GEMINI_MODELS.map((model: GeminiModelInfo) => {
            const isSelected = selected === model.id;
            const isCurrent = current === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => setSelected(model.id)}
                className={`text-left w-full p-4 rounded-xl border transition-all ${
                  isSelected
                    ? "bg-amber-400/10 border-amber-400/50"
                    : "bg-white/[0.03] border-white/8 hover:border-white/20"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{model.label}</span>
                      {isCurrent && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                          In use
                        </span>
                      )}
                    </div>
                    <code className="text-[10px] text-white/40 font-mono break-all">
                      {model.id}
                    </code>
                    <p className="text-[11px] text-white/50 mt-1">{model.description}</p>
                  </div>
                  <div
                    className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center ${
                      isSelected
                        ? "bg-amber-400 border-amber-400"
                        : "border-white/20"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-black stroke-[3]" />}
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
                  <span className="flex items-center gap-1.5 text-[11px] text-white/60">
                    <Zap className="w-3 h-3 text-amber-400" />
                    {model.latency}
                  </span>
                  <span className="text-[11px] text-white/60">
                    ${model.pricePerImageUsd.toFixed(4)}
                    <span className="text-white/35"> / image @ 1K</span>
                  </span>
                </div>
              </button>
            );
          })}

          {error && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 px-5 sm:px-6 py-4 bg-[#12121a] border-t border-white/8">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-semibold text-xs hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={saving}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-white font-semibold text-xs shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving
              ? "Switching…"
              : selected === current
                ? "Keep Current Model"
                : "Switch & Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
