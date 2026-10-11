"use client";

/**
 * Admin → Standee Leads. Everyone who gave their number on a standee's phone
 * page (/s/[token]), grouped by the standee that produced them, with what
 * they showed interest in: home trial (standee discount), photos sent,
 * WhatsApp, call, store. Sales works these from here; status changes and
 * notes reuse the Sales CRM's /api/admin/leads/action.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Home,
  Loader2,
  MessageCircle,
  MonitorSmartphone,
  Phone,
  Search,
  Send,
  ShoppingBag,
  Users,
  X,
  AlertCircle,
} from "lucide-react";

interface StandeeLead {
  id: string;
  name: string | null;
  phone: string | null;
  status: string;
  isRead: boolean;
  generationsCount: number;
  createdAt: string;
  lastActivityAt: string | null;
  kiosk: { id: string; name: string; location: string | null };
  interests: { homeTrial: string | null; photosSent: string | null; whatsapp: boolean; call: boolean; store: boolean };
  looks: { url: string; styleName: string | null }[];
  timeline: { event: string; meta: Record<string, unknown> | null; createdAt: string }[];
}

const EVENT_LABEL: Record<string, string> = {
  qr_scanned: "Scanned the QR",
  number_submitted: "Gave their number",
  photo_link_sent: "Photos sent by SMS",
  home_trial_interest: "Wants a home trial (standee offer)",
  whatsapp_clicked: "Opened WhatsApp chat",
  call_clicked: "Tapped Call",
  store_clicked: "Visited the store website",
};

const STATUSES = ["new", "contacted", "qualified", "converted", "lost"] as const;

const inputClass =
  "px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-amber-400/50";

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
}

export default function StandeeLeadsPage() {
  const [leads, setLeads] = useState<StandeeLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ q: "", kioskId: "", interest: "", dateFrom: "", dateTo: "" });
  const [kioskOptions, setKioskOptions] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<StandeeLead | null>(null);
  const [exporting, setExporting] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams({ channel: "kiosk", sort: "recent_activity", qualifiedOnly: "true" });
    for (const [k, v] of Object.entries(filters)) if (v.trim()) p.set(k, v.trim());
    return p;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/kiosk-leads?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to load standee leads.");
        return;
      }
      const list = (data?.leads ?? []) as StandeeLead[];
      setLeads(list);
      setError(null);
      // The standee picker is built from what's been seen, so it works for
      // sales agents too (Admin → Kiosks is super_admin only).
      setKioskOptions((prev) => {
        const map = new Map(prev.map((k) => [k.id, k.name]));
        list.forEach((l) => map.set(l.kiosk.id, l.kiosk.name));
        return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
      });
    } catch {
      setError("Failed to load standee leads.");
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const p = new URLSearchParams(params);
      // whatsapp/call filters are event-based and not understood by the export.
      if (p.get("interest") === "whatsapp" || p.get("interest") === "call") p.delete("interest");
      const res = await fetch(`/api/admin/leads/export?${p.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `standee_leads_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const counts = useMemo(
    () => ({
      total: leads.length,
      homeTrial: leads.filter((l) => l.interests.homeTrial).length,
      photos: leads.filter((l) => l.interests.photosSent).length,
      whatsapp: leads.filter((l) => l.interests.whatsapp).length,
    }),
    [leads]
  );

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-amber-400" />
            Standee Leads
          </h1>
          <p className="text-xs text-white/50 mt-1">
            Customers who scanned a standee&apos;s QR and gave their number, and what they want next.
          </p>
        </div>
        <button
          onClick={exportXlsx}
          disabled={exporting}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium disabled:opacity-40"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export to Excel
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          ["Leads", counts.total],
          ["Want home trial", counts.homeTrial],
          ["Photos sent", counts.photos],
          ["WhatsApp", counts.whatsapp],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-white/[0.03] border border-white/8 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
            <div className="text-lg font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search phone…"
            className={`${inputClass} w-full pl-9`}
          />
        </div>
        <select
          value={filters.kioskId}
          onChange={(e) => setFilters((f) => ({ ...f, kioskId: e.target.value }))}
          className={inputClass}
        >
          <option value="" className="bg-[#141414]">All standees</option>
          {kioskOptions.map((k) => (
            <option key={k.id} value={k.id} className="bg-[#141414]">
              {k.name}
            </option>
          ))}
        </select>
        <select
          value={filters.interest}
          onChange={(e) => setFilters((f) => ({ ...f, interest: e.target.value }))}
          className={inputClass}
        >
          <option value="" className="bg-[#141414]">Any interest</option>
          <option value="home_trial" className="bg-[#141414]">Wants home trial</option>
          <option value="photos" className="bg-[#141414]">Photos sent</option>
          <option value="whatsapp" className="bg-[#141414]">Opened WhatsApp</option>
          <option value="call" className="bg-[#141414]">Tapped Call</option>
        </select>
        <div className="flex gap-2">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            className={`${inputClass} w-full`}
            aria-label="From date"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            className={`${inputClass} w-full`}
            aria-label="To date"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="rounded-2xl bg-white/[0.03] border border-white/8 overflow-hidden">
        {loading && leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/40 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
            <span className="text-xs">Loading standee leads…</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center text-xs text-white/40">
            No standee leads yet. They appear here when a customer scans the QR on a standee and enters their number.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {leads.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelected(l)}
                className="w-full text-left flex flex-col md:flex-row md:items-center gap-3 px-4 sm:px-6 py-4 hover:bg-white/[0.03]"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {!l.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-label="Unread" />}
                  <div className="flex -space-x-3 shrink-0">
                    {l.looks.slice(0, 3).map((look, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={look.url} alt="" className="h-12 w-9 rounded-lg object-cover border-2 border-[#141414]" />
                    ))}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {l.name || "No name"} <span className="font-normal text-white/50">· {l.phone}</span>
                    </div>
                    <div className="text-[11px] text-white/40 flex items-center gap-1.5 truncate">
                      <MonitorSmartphone className="w-3 h-3 shrink-0" /> {l.kiosk.name} · {fmt(l.createdAt)}
                    </div>
                  </div>
                </div>
                <InterestChips interests={l.interests} />
                <span className="text-[11px] font-medium capitalize text-amber-400 md:w-20 md:text-right">{l.status}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}

function InterestChips({ interests }: { interests: StandeeLead["interests"] }) {
  const chips = [
    interests.homeTrial && { icon: Home, label: "Home trial", tone: "bg-rose-500/15 text-rose-300 border-rose-500/25" },
    interests.photosSent && { icon: Send, label: "Photos sent", tone: "bg-sky-500/15 text-sky-300 border-sky-500/25" },
    interests.whatsapp && { icon: MessageCircle, label: "WhatsApp", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
    interests.call && { icon: Phone, label: "Call", tone: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
    interests.store && { icon: ShoppingBag, label: "Store", tone: "bg-white/10 text-white/60 border-white/15" },
  ].filter(Boolean) as { icon: typeof Home; label: string; tone: string }[];

  if (chips.length === 0) return <span className="text-[11px] text-white/30">No actions yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(({ icon: Icon, label, tone }) => (
        <span key={label} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${tone}`}>
          <Icon className="w-3 h-3" /> {label}
        </span>
      ))}
    </div>
  );
}

function LeadDrawer({ lead, onClose, onChanged }: { lead: StandeeLead; onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState(lead.status);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Opening the lead marks it read (the CRM detail route does this).
  useEffect(() => {
    if (!lead.isRead) void fetch(`/api/admin/leads/${lead.id}`).then(() => onChanged());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened lead
  }, [lead.id]);

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/leads/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, ...body }),
      });
      const data = await res.json().catch(() => null);
      setMessage(res.ok ? done : data?.error ?? "Failed.");
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const digits = lead.phone?.replace(/\D/g, "") ?? "";
  const discount = lead.timeline.find((t) => t.event === "home_trial_interest")?.meta?.discountPercent;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-[#111] border-l border-white/10 p-6 flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{lead.name || "No name"}</h2>
            <p className="text-sm text-white/60">{lead.phone}</p>
            <p className="text-[11px] text-white/40 mt-1 flex items-center gap-1.5">
              <MonitorSmartphone className="w-3 h-3" /> {lead.kiosk.name}
              {lead.kiosk.location ? ` — ${lead.kiosk.location}` : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-white/10 text-white/60">
            <X className="w-4 h-4" />
          </button>
        </div>

        {lead.interests.homeTrial && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/25 px-4 py-3 text-xs text-rose-200">
            <b>Wants a home trial</b>
            {typeof discount === "number" ? ` with the ${discount}% standee discount` : ""} — claimed {fmt(lead.interests.homeTrial)}.
            Call to schedule.
          </div>
        )}

        <div className="flex gap-2">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium">
              <Phone className="w-3.5 h-3.5" /> Call
            </a>
          )}
          {digits && (
            <a
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium"
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          )}
        </div>

        {lead.looks.length > 0 && (
          <div>
            <h3 className="text-[10px] uppercase tracking-wide text-white/40 mb-2">Looks ({lead.generationsCount})</h3>
            <div className="grid grid-cols-2 gap-2">
              {lead.looks.map((look, i) => (
                <figure key={i} className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={look.url} alt="" className="w-full aspect-[3/4] rounded-xl object-cover" />
                  {look.styleName && <figcaption className="text-[11px] text-white/50 truncate">{look.styleName}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-[10px] uppercase tracking-wide text-white/40 mb-2">Timeline</h3>
          <ol className="flex flex-col gap-2">
            {lead.timeline.map((t, i) => (
              <li key={i} className="flex items-start gap-3 text-xs">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                <span className="flex-1 text-white/80">{EVENT_LABEL[t.event] ?? t.event}</span>
                <span className="text-white/40 shrink-0">{fmt(t.createdAt)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[10px] uppercase tracking-wide text-white/40">Status</h3>
          <div className="flex gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} flex-1 capitalize`}>
              {STATUSES.map((s) => (
                <option key={s} value={s} className="bg-[#141414]">
                  {s}
                </option>
              ))}
            </select>
            <button
              disabled={busy || status === lead.status}
              onClick={() => act({ actionType: "status_change", status }, "Status updated.")}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium disabled:opacity-30"
            >
              Save
            </button>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (e.g. home trial booked for Sat 4pm)…"
            rows={3}
            className={`${inputClass} resize-none`}
          />
          <button
            disabled={busy || !note.trim()}
            onClick={async () => {
              await act({ actionType: "note", notes: note.trim() }, "Note added.");
              setNote("");
            }}
            className="self-end px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium disabled:opacity-30"
          >
            Add note
          </button>
          {message && <p className="text-xs text-white/60">{message}</p>}
        </div>
      </div>
    </div>
  );
}
