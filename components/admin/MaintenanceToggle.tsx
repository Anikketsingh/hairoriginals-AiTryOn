"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  X,
} from "lucide-react";

interface MaintenanceState {
  enabled: boolean;
  message: string;
  /** False when MAINTENANCE_PASSWORD is unset on this deployment. */
  configured: boolean;
  /** Whether this browser holds a preview bypass and so still sees the live site. */
  bypassing?: boolean;
}

/** What the pending confirmation will write if the password checks out. */
interface PendingChange {
  enabled: boolean;
  message?: string;
}

/**
 * Site-wide maintenance switch for Admin → AI Configuration.
 *
 * Saves on its own rather than through the page's "Save Configuration" button,
 * because every write here has to carry MAINTENANCE_PASSWORD — a secret only
 * the owner holds, and one that must never be bundled into an ordinary
 * settings save. See lib/maintenance.ts and /api/admin/maintenance.
 */
export default function MaintenanceToggle() {
  const [state, setState] = useState<MaintenanceState | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [droppingBypass, setDroppingBypass] = useState(false);

  const dropBypass = useCallback(async () => {
    setDroppingBypass(true);
    try {
      const res = await fetch("/api/admin/maintenance", { method: "DELETE" });
      if (res.ok) {
        setState((prev) => (prev ? { ...prev, bypassing: false } : prev));
      }
    } catch (err) {
      console.error("Failed to drop maintenance bypass:", err);
    } finally {
      setDroppingBypass(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/maintenance");
        if (!res.ok) return;
        const data = (await res.json()) as MaintenanceState;
        if (cancelled) return;
        setState(data);
        setDraftMessage(data.message);
      } catch (err) {
        console.error("Failed to load maintenance state:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfirmed = useCallback((next: MaintenanceState) => {
    setState(next);
    setDraftMessage(next.message);
    setPending(null);
    setFlash(
      next.enabled
        ? "Maintenance mode is ON — the customer site is now closed."
        : "Maintenance mode is OFF — the customer site is live again."
    );
    window.setTimeout(() => setFlash(null), 5000);
  }, []);

  if (!state) {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex items-center gap-2 text-white/40 text-xs">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading site availability…
      </div>
    );
  }

  const { enabled, configured } = state;
  const messageDirty = draftMessage.trim() !== state.message.trim();

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-6 flex flex-col gap-5 transition-colors ${
        enabled
          ? "bg-red-500/[0.07] border-red-500/30"
          : "bg-white/[0.03] border-white/8"
      }`}
    >
      <div className="flex items-center gap-2 pb-3 border-b border-white/8">
        {enabled ? (
          <Lock className="w-4 h-4 text-red-400" />
        ) : (
          <Globe className="w-4 h-4 text-emerald-400" />
        )}
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
          Site Availability
        </h2>
        <span
          className={`ml-auto text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
            enabled
              ? "bg-red-500/15 text-red-400"
              : "bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {enabled ? "Under maintenance" : "Live"}
        </span>
      </div>

      {/* The switch */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Maintenance Mode</p>
          <p className="text-[10px] text-white/40 mt-1 leading-relaxed">
            Closes the entire customer site — every page and every customer API
            returns the message below instead. The admin dashboard stays open, so
            you can always switch back. Requires the maintenance password.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Maintenance mode"
          disabled={!configured}
          onClick={() => setPending({ enabled: !enabled })}
          className={`shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            enabled ? "bg-red-500" : "bg-white/15"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* The switch working correctly looks identical to it being broken, from
          the browser that flipped it. Say so plainly. */}
      {enabled && state.bypassing && (
        <div className="flex flex-col gap-2 px-3.5 py-3 rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-300 text-[11px]">
          <div className="flex items-start gap-2">
            <Eye className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span className="font-medium leading-relaxed">
              Visitors are seeing the maintenance screen right now.{" "}
              <strong className="font-bold">This browser is exempt</strong> — you
              still get the normal site. Open a private window to see what
              customers see.
            </span>
          </div>
          <button
            type="button"
            onClick={dropBypass}
            disabled={droppingBypass}
            className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 font-semibold text-[10px] hover:bg-white/10 transition disabled:opacity-40"
          >
            {droppingBypass ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <EyeOff className="w-3 h-3" />
            )}
            Drop my bypass
          </button>
        </div>
      )}

      {!configured && (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            <code className="font-mono">MAINTENANCE_PASSWORD</code> is not set on
            this deployment, so the switch is disabled. Add it to your environment
            variables and redeploy.
          </span>
        </div>
      )}

      {/* Visitor-facing copy */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-white/60">
          Message Shown to Visitors
        </label>
        <textarea
          rows={3}
          maxLength={500}
          value={draftMessage}
          onChange={(e) => setDraftMessage(e.target.value)}
          disabled={!configured}
          className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50 disabled:opacity-40"
        />
        {messageDirty && (
          <button
            type="button"
            onClick={() =>
              setPending({ enabled, message: draftMessage.trim() })
            }
            disabled={!configured || draftMessage.trim() === ""}
            className="self-start mt-1 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 font-semibold text-[11px] hover:bg-white/10 transition disabled:opacity-40"
          >
            <KeyRound className="w-3 h-3" /> Save message
          </button>
        )}
      </div>

      {flash && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <CheckCircle className="w-4 h-4 shrink-0" /> {flash}
        </div>
      )}

      {pending && (
        <MaintenancePasswordDialog
          change={pending}
          currentlyEnabled={enabled}
          onClose={() => setPending(null)}
          onConfirmed={handleConfirmed}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

function MaintenancePasswordDialog({
  change,
  currentlyEnabled,
  onClose,
  onConfirmed,
}: {
  change: PendingChange;
  currentlyEnabled: boolean;
  onClose: () => void;
  onConfirmed: (next: MaintenanceState) => void;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // Only mounted after a click, so there's no SSR pass to mismatch against —
  // but document still must exist before portalling.
  if (typeof document === "undefined") return null;

  const isTogglingOn = change.enabled && !currentlyEnabled;
  const isTogglingOff = !change.enabled && currentlyEnabled;

  const title = isTogglingOn
    ? "Take the site down?"
    : isTogglingOff
      ? "Bring the site back?"
      : "Update maintenance message";

  const description = isTogglingOn
    ? "Every visitor will immediately see the maintenance screen instead of the try-on app, and customer API calls will fail with a 503. You'll keep access to the live site in this browser."
    : isTogglingOff
      ? "The customer site reopens for everyone right away."
      : "Changes only the copy visitors see while maintenance mode is on.";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...change, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      onConfirmed(body as MaintenanceState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the change.");
      setPassword("");
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-[#12121a] border border-white/10 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-white/8">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              {title}
            </h2>
            <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
              {description}
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

        <div className="px-5 sm:px-6 py-5 flex flex-col gap-3">
          <label
            htmlFor="maintenance-password"
            className="text-xs font-semibold text-white/60"
          >
            Maintenance Password
          </label>
          <input
            ref={inputRef}
            id="maintenance-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
          />

          {error && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 px-5 sm:px-6 py-4 border-t border-white/8">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-semibold text-xs hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || password === ""}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold text-xs shadow-lg transition-all disabled:opacity-50 disabled:hover:scale-100 hover:scale-[1.02] active:scale-[0.98] ${
              isTogglingOn
                ? "bg-red-500 shadow-red-500/20"
                : "bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 shadow-orange-500/20"
            }`}
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting
              ? "Applying…"
              : isTogglingOn
                ? "Take site down"
                : isTogglingOff
                  ? "Bring site back"
                  : "Save message"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
