"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MonitorSmartphone,
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
  Link2,
  Copy,
  Ban,
  Power,
  Save,
  Film,
  Upload,
  Trash2,
} from "lucide-react";
import { supabaseAdminBrowserClient } from "@/lib/supabase/admin-browser-client";

interface KioskConfig {
  triesPerVisitor: number;
  dailyGenerationCap: number;
  idleTimeoutSeconds: number;
  downloadLinkTtlHours: number;
  attractVideoUrl: string | null;
}

type NumericConfigKey = Exclude<keyof KioskConfig, "attractVideoUrl">;

interface KioskEntry {
  id: string;
  name: string;
  location: string | null;
  isActive: boolean;
  enrolled: boolean;
  online: boolean;
  lastSeenAt: string | null;
  appVersion: string | null;
  config: KioskConfig;
  stats: {
    generationsToday: number;
    generations7d: number;
    qrShown: number;
    qrScanned: number;
    numbers: number;
    homeTrial: number;
    cost30dUsd: number;
  };
}

interface Enrollment {
  kioskName: string;
  code: string;
  url: string;
  expiresAt: string;
}

const CONFIG_FIELDS: { key: NumericConfigKey; label: string; hint: string }[] = [
  { key: "triesPerVisitor", label: "Tries / visitor", hint: "Try-ons each walk-up gets" },
  { key: "dailyGenerationCap", label: "Daily cap", hint: "Max try-ons per day (cost guard)" },
  { key: "idleTimeoutSeconds", label: "Idle reset (s)", hint: "Seconds before screen resets" },
  { key: "downloadLinkTtlHours", label: "QR link (h)", hint: "Hours the download link works" },
];

const inputClass =
  "px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-amber-400/50";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function KiosksPage() {
  const [kiosks, setKiosks] = useState<KioskEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [form, setForm] = useState({ name: "", location: "" });
  const [drafts, setDrafts] = useState<Record<string, KioskConfig>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/kiosks");
      if (res.ok) {
        const data = await res.json();
        setKiosks(data.kiosks ?? []);
      } else {
        setError("Failed to load kiosks.");
      }
    } catch {
      setError("Failed to load kiosks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    // Keep the Online/Offline dots honest while the page is open.
    const t = setInterval(load, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setCreating(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/kiosks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (res.ok) {
          setEnrollment({ kioskName: form.name, ...data.enrollment });
          setForm({ name: "", location: "" });
          load();
        } else {
          setError(data.error || "Failed to create the kiosk.");
        }
      } catch {
        setError("Failed to create the kiosk.");
      } finally {
        setCreating(false);
      }
    },
    [form, load]
  );

  const issueEnrollment = useCallback(async (k: KioskEntry) => {
    setRowBusy(k.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/kiosks/${k.id}/enroll`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setEnrollment({ kioskName: k.name, ...data.enrollment });
      else setError(data.error || "Failed to issue an enrollment link.");
    } catch {
      setError("Failed to issue an enrollment link.");
    } finally {
      setRowBusy(null);
    }
  }, []);

  const patchKiosk = useCallback(
    async (id: string, body: Record<string, unknown>, message: string) => {
      setRowBusy(id);
      setError(null);
      try {
        const res = await fetch("/api/admin/kiosks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...body }),
        });
        const data = await res.json();
        if (res.ok) {
          flashSuccess(message);
          setDrafts((d) => {
            const next = { ...d };
            delete next[id];
            return next;
          });
          load();
        } else {
          setError(data.error || "Failed to update the kiosk.");
        }
      } catch {
        setError("Failed to update the kiosk.");
      } finally {
        setRowBusy(null);
      }
    },
    [load]
  );

  return (
    <div className="flex flex-col gap-6 sm:gap-8 max-w-5xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <MonitorSmartphone className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-amber-400" />
          Kiosks
        </h1>
        <p className="text-xs text-white/50 mt-1">
          In-store video standees running the try-on at /kiosk. Register a standee, then open its enrollment link on
          that standee once.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <CheckCircle className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}

      {enrollment && (
        <div className="rounded-2xl bg-amber-400/10 border border-amber-400/30 p-4 sm:p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Enrollment link for &ldquo;{enrollment.kioskName}&rdquo;</h2>
          </div>
          <p className="text-xs text-white/60">
            Open this link once on the standee (before locking it down), or type the code at /kiosk/enroll. It works
            one time and expires {new Date(enrollment.expiresAt).toLocaleString()}. It is shown only now.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/30 border border-white/10 text-amber-200 text-xs break-all">
              {enrollment.url}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(enrollment.url);
                flashSuccess("Link copied.");
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium"
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
          </div>
          <p className="text-xs text-white/60">
            Code: <span className="font-mono text-base text-white tracking-widest">{enrollment.code}</span>
          </p>
          <button onClick={() => setEnrollment(null)} className="self-start text-[11px] text-white/40 hover:text-white/70">
            Dismiss
          </button>
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-5"
      >
        <div className="flex items-center gap-2 pb-3 border-b border-white/8">
          <Plus className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Register a Kiosk</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Phoenix Mall Standee 1"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60">Location</label>
            <input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Phoenix Marketcity, Mumbai — Ground floor"
              className={inputClass}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="self-end w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-white font-semibold text-xs shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {creating ? "Creating…" : "Create Kiosk"}
        </button>
      </form>

      <div className="rounded-2xl bg-white/[0.03] border border-white/8 overflow-hidden">
        <div className="flex items-center gap-2 px-4 sm:px-6 py-4 border-b border-white/8">
          <MonitorSmartphone className="w-4 h-4 shrink-0 text-rose-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Standees {!loading && `(${kiosks.length})`}
          </h2>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/40 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
            <span className="text-xs">Loading kiosks…</span>
          </div>
        ) : kiosks.length === 0 ? (
          <div className="py-16 text-center text-xs text-white/40">No kiosks registered yet.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {kiosks.map((k) => {
              const busy = rowBusy === k.id;
              const draft = drafts[k.id] ?? k.config;
              const dirty = drafts[k.id] !== undefined;
              return (
                <div key={k.id} className="flex flex-col gap-4 px-4 sm:px-6 py-5">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          !k.isActive ? "bg-red-400" : k.online ? "bg-emerald-400" : "bg-white/20"
                        }`}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-white font-medium truncate">{k.name}</span>
                        <span className="text-[11px] text-white/40 truncate">
                          {k.location || "No location"} ·{" "}
                          {!k.enrolled
                            ? "Not enrolled"
                            : k.online
                              ? "Online"
                              : `Offline — last seen ${timeAgo(k.lastSeenAt)}`}
                          {k.appVersion && ` · v${k.appVersion}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        disabled={busy}
                        onClick={() => issueEnrollment(k)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs font-medium disabled:opacity-40"
                      >
                        <Link2 className="w-3.5 h-3.5" /> {k.enrolled ? "Re-enroll" : "Enrollment link"}
                      </button>
                      {k.enrolled && (
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`Revoke "${k.name}"? The standee stops working until it is enrolled again.`)) {
                              patchKiosk(k.id, { revoke: true }, "Kiosk revoked.");
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-white/70 hover:text-red-400 text-xs font-medium disabled:opacity-40"
                        >
                          <Ban className="w-3.5 h-3.5" /> Revoke
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() =>
                          patchKiosk(k.id, { isActive: !k.isActive }, k.isActive ? "Kiosk disabled." : "Kiosk enabled.")
                        }
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium disabled:opacity-40 ${
                          k.isActive
                            ? "bg-white/5 hover:bg-red-500/10 border-white/10 text-white/70 hover:text-red-400"
                            : "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400"
                        }`}
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                        {k.isActive ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
                    {[
                      ["Try-ons today", k.stats.generationsToday],
                      ["Try-ons 7d", k.stats.generations7d],
                      ["QR shown 30d", k.stats.qrShown],
                      ["QR scanned", k.stats.qrScanned],
                      ["Numbers", k.stats.numbers],
                      ["Home trial", k.stats.homeTrial],
                      ["Cost 30d", `$${k.stats.cost30dUsd.toFixed(2)}`],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
                        <div className="text-sm font-semibold text-white">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                    {CONFIG_FIELDS.map((f) => (
                      <label key={f.key} className="flex flex-col gap-1" title={f.hint}>
                        <span className="text-[10px] uppercase tracking-wide text-white/40">{f.label}</span>
                        <input
                          type="number"
                          min={1}
                          value={draft[f.key]}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [k.id]: { ...draft, [f.key]: Number(e.target.value) } }))
                          }
                          className={inputClass}
                        />
                      </label>
                    ))}
                    <button
                      disabled={!dirty || busy}
                      onClick={() => {
                        // The video has its own save path (KioskVideo); only send the numbers.
                        const { attractVideoUrl: _video, ...numbers } = draft;
                        void _video;
                        patchKiosk(k.id, { config: numbers }, "Settings saved.");
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium disabled:opacity-30"
                    >
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                  </div>

                  <KioskVideo
                    kioskId={k.id}
                    videoUrl={k.config.attractVideoUrl}
                    disabled={busy}
                    onSaved={(msg) => {
                      flashSuccess(msg);
                      load();
                    }}
                    onError={setError}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <OfferSettingsCard onSaved={flashSuccess} onError={setError} />
    </div>
  );
}

/**
 * Per-standee attract video. Uploads go straight from this browser to the
 * kiosk-media bucket with a signed upload URL (videos are far too big for a
 * route handler's body limit), then the kiosk is pointed at the new file.
 * Standees pick the change up on their next heartbeat (within a minute).
 */
function KioskVideo({
  kioskId,
  videoUrl,
  disabled,
  onSaved,
  onError,
}: {
  kioskId: string;
  videoUrl: string | null;
  disabled: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "saving">("idle");

  const setVideo = async (attractVideoUrl: string | null) => {
    const res = await fetch("/api/admin/kiosks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: kioskId, attractVideoUrl }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Failed to update the video.");
  };

  const upload = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) return onError("Video must be 50MB or smaller.");
    setStatus("uploading");
    try {
      const res = await fetch(`/api/admin/kiosks/${kioskId}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Couldn't start the upload.");

      const { error } = await supabaseAdminBrowserClient.storage
        .from("kiosk-media")
        .uploadToSignedUrl(data.path, data.token, file, { contentType: file.type });
      if (error) throw new Error(error.message);

      setStatus("saving");
      await setVideo(data.publicUrl);
      onSaved("Video uploaded. The standee switches to it within a minute.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Video upload failed.");
    } finally {
      setStatus("idle");
    }
  };

  const remove = async () => {
    if (!confirm("Remove this standee's video? It will show the built-in attract screen instead.")) return;
    setStatus("saving");
    try {
      await setVideo(null);
      onSaved("Video removed.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't remove the video.");
    } finally {
      setStatus("idle");
    }
  };

  const working = status !== "idle";

  return (
    <div className="flex items-center gap-4 rounded-xl bg-white/[0.03] border border-white/5 p-3">
      <div className="h-24 w-[54px] shrink-0 overflow-hidden rounded-lg bg-black/40 border border-white/10 flex items-center justify-center">
        {videoUrl ? (
          <video src={videoUrl} muted loop autoPlay playsInline className="h-full w-full object-cover" />
        ) : (
          <Film className="w-4 h-4 text-white/25" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-white/40">Attract video</div>
        <p className="text-xs text-white/60 mt-0.5">
          {videoUrl
            ? "Loops on the idle screen."
            : "None — the standee shows the built-in before/after screen."}{" "}
          <span className="text-white/35">Portrait 1080×1920 MP4, up to 50MB.</span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          disabled={disabled || working}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium disabled:opacity-40"
        >
          {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {status === "uploading" ? "Uploading…" : status === "saving" ? "Saving…" : videoUrl ? "Replace" : "Upload"}
        </button>
        {videoUrl && (
          <button
            disabled={disabled || working}
            onClick={remove}
            aria-label="Remove video"
            className="flex items-center px-2.5 py-2 rounded-lg bg-white/5 hover:bg-red-500/10 border border-white/10 text-white/60 hover:text-red-400 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="sr-only"
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const OFFER_FIELDS = [
  { key: "kiosk_offer_discount_percent", label: "Home-trial discount (%)", type: "number", hint: "Shown on the standee and the phone page. 0 hides the discount." },
  { key: "kiosk_offer_title", label: "Offer headline", type: "text", hint: "{discount} becomes the % above." },
  { key: "kiosk_offer_text", label: "Offer details", type: "textarea", hint: "" },
  { key: "kiosk_offer_coupon_code", label: "Coupon code (optional)", type: "text", hint: "Shown with the offer. Leave empty to hide." },
  { key: "kiosk_whatsapp_number", label: "WhatsApp number", type: "text", hint: "With country code, e.g. 919876543210. Empty hides WhatsApp." },
  { key: "kiosk_contact_phone", label: "Call-us number", type: "text", hint: "e.g. +919876543210. Empty hides Call." },
] as const;

type OfferKey = (typeof OFFER_FIELDS)[number]["key"];

/**
 * The standee phone page's home-trial offer and contact options — one set for
 * every standee. Stored in `settings` (rows seeded by the kiosk_handoff
 * migration) and saved through the generic /api/admin/settings.
 */
function OfferSettingsCard({ onSaved, onError }: { onSaved: (msg: string) => void; onError: (msg: string) => void }) {
  const [values, setValues] = useState<Record<OfferKey, string> | null>(null);
  const [initial, setInitial] = useState<Record<OfferKey, string> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((all: Record<string, unknown> | null) => {
        if (!all) return;
        const v = Object.fromEntries(
          OFFER_FIELDS.map((f) => [f.key, all[f.key] === undefined || all[f.key] === null ? "" : String(all[f.key])])
        ) as Record<OfferKey, string>;
        setValues(v);
        setInitial(v);
      })
      .catch(() => {});
  }, []);

  const dirty = values && initial && OFFER_FIELDS.some((f) => values[f.key] !== initial[f.key]);

  const save = async () => {
    if (!values) return;
    const discount = Number(values.kiosk_offer_discount_percent);
    if (!Number.isFinite(discount) || discount < 0 || discount > 90) return onError("Discount must be between 0 and 90.");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: OFFER_FIELDS.map((f) => ({
            key: f.key,
            value: f.key === "kiosk_offer_discount_percent" ? Math.round(discount) : values[f.key].trim(),
          })),
        }),
      });
      if (!res.ok) throw new Error();
      setInitial(values);
      onSaved("Standee offer saved. Standees and phone pages pick it up within a minute.");
    } catch {
      onError("Couldn't save the standee offer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center gap-2 pb-3 border-b border-white/8">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Standee offer &amp; contact</h2>
        <span className="text-[11px] text-white/40 normal-case">— shown on the customer&apos;s phone after scanning</span>
      </div>
      {!values ? (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {OFFER_FIELDS.map((f) => (
              <label key={f.key} className={`flex flex-col gap-1.5 ${f.type === "textarea" ? "md:col-span-2" : ""}`}>
                <span className="text-xs font-semibold text-white/60">{f.label}</span>
                {f.type === "textarea" ? (
                  <textarea
                    rows={3}
                    value={values[f.key]}
                    onChange={(e) => setValues((v) => v && { ...v, [f.key]: e.target.value })}
                    className={`${inputClass} resize-none`}
                  />
                ) : (
                  <input
                    type={f.type}
                    value={values[f.key]}
                    onChange={(e) => setValues((v) => v && { ...v, [f.key]: e.target.value })}
                    className={inputClass}
                  />
                )}
                {f.hint && <span className="text-[11px] text-white/35">{f.hint}</span>}
              </label>
            ))}
          </div>
          <button
            disabled={!dirty || saving}
            onClick={save}
            className="self-end flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium disabled:opacity-30"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save offer
          </button>
        </>
      )}
    </div>
  );
}
