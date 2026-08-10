"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { UserCheck, MessageSquare, PlusCircle, Loader2, Clock, ShieldAlert, Search, Sparkles, ShoppingBag, Star, ArrowUpDown, Flame, Download, AlertCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";

interface Lead {
  id: string;
  phone: string | null;
  funnel_stage_at_creation: number;
  generations_count: number;
  status: string;
  source: string;
  is_read: boolean;
  created_at: string;
  /** Bumped only when the customer completes another try-on (see lib/leads.ts). */
  last_activity_at: string | null;
  agent_actions: {
    id: string;
    action_type: string;
    notes: string | null;
    credit_amount: number | null;
    created_at: string;
  }[];
}

/** Sort measures offered in the CRM list — keys match the API's SORT_OPTIONS. */
const SORT_OPTIONS = [
  { value: "recent_activity", label: "Recent activity" },
  { value: "newest", label: "Newest leads" },
  { value: "oldest", label: "Oldest leads" },
  { value: "most_tryons", label: "Most try-ons" },
  { value: "status", label: "Status" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["value"];

/** Compact "3h ago" / "2d ago" relative time; empty string for missing dates. */
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/**
 * True when the customer engaged again after the lead was first captured.
 * The initial try-on that creates a lead bumps last_activity_at within
 * seconds of created_at, so we ignore gaps under 5 minutes to avoid
 * badging first-time leads as "returning".
 */
function hasReturned(lead: Lead): boolean {
  if (!lead.last_activity_at) return false;
  const gap = new Date(lead.last_activity_at).getTime() - new Date(lead.created_at).getTime();
  return gap > 5 * 60 * 1000;
}

interface LeadLook {
  id: string;
  result_url: string | null;
  result_mime_type: string | null;
  /** The customer's captured photo. Null for looks generated before source photos were stored. */
  source_url: string | null;
  created_at: string;
  products: { id: string; name: string; image_url: string; price: number | null } | null;
}

interface InterestedProduct {
  id: string;
  name: string;
  image_url: string;
  price: number | null;
  selling_price?: number | null;
  currency?: string | null;
  saved?: boolean;
}

interface LeadFeedback {
  id: string;
  experience_rating: number;
  improvement: string | null;
  interest: string | null;
  created_at: string;
  products: { name: string } | null;
}

interface LeadDetail {
  looks: LeadLook[];
  interestedProducts: InterestedProduct[];
  feedback: LeadFeedback[];
  credits: { remaining: number; used: number };
}

const RATING_EMOJI: Record<number, string> = { 1: "😞", 2: "😐", 3: "🙂", 4: "😍" };
const INTEREST_LABEL: Record<string, string> = {
  yes: "Interested",
  maybe: "Maybe later",
  browsing: "Just browsing",
};

export default function SalesCRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent_activity");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [newStatus, setNewStatus] = useState("contacted");
  const [creditCount, setCreditCount] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const unreadCount = leads.filter((l) => !l.is_read).length;

  /**
   * Below lg the workspace sits *under* the leads list rather than beside it,
   * so a tap on a lead would otherwise change a panel that's off-screen.
   */
  const selectLead = useCallback((lead: Lead) => {
    setActiveLead(lead);
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
      requestAnimationFrame(() =>
        workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    }
  }, []);

  // Shared by fetchLeads and the export button so the exported file can
  // never drift from whatever filters are currently on screen.
  const buildLeadParams = useCallback(() => {
    const params = new URLSearchParams({ sort });
    if (search.trim()) params.set("q", search.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (qualifiedOnly) params.set("qualifiedOnly", "true");
    if (readFilter !== "all") params.set("readStatus", readFilter);
    return params;
  }, [search, sort, dateFrom, dateTo, qualifiedOnly, readFilter]);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/leads?${buildLeadParams().toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
        setActiveLead((prev) => prev ?? (data.length > 0 ? data[0] : null));
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      setLoading(false);
    }
  }, [buildLeadParams]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/admin/leads/export?${buildLeadParams().toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setExportError(data?.error ?? "Failed to export leads.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filenameMatch?.[1] ?? "leads_export.xlsx";
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Failed to export leads:", err);
      setExportError("Failed to export leads.");
    } finally {
      setExporting(false);
    }
  }, [buildLeadParams]);

  // Debounced agent search / filter change — re-run on any filter update.
  useEffect(() => {
    const t = setTimeout(() => fetchLeads(), 300);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  // Load the selected customer's looks + interested products + credit balance.
  const activeLeadId = activeLead?.id ?? null;

  const fetchLeadDetail = useCallback(async (leadId: string | null) => {
    if (!leadId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`);
      if (res.ok) {
        const data = await res.json();
        setDetail({
          looks: data.looks ?? [],
          interestedProducts: data.interestedProducts ?? [],
          feedback: data.feedback ?? [],
          credits: data.credits ?? { remaining: 0, used: 0 },
        });
        // Opening the detail view marks the lead read server-side (see
        // [id]/route.ts) — reflect that locally so the unread dot clears
        // without a full list refetch.
        setLeads((prev) => prev.map((l) => (l.id === leadId && !l.is_read ? { ...l, is_read: true } : l)));
        setActiveLead((prev) => (prev && prev.id === leadId && !prev.is_read ? { ...prev, is_read: true } : prev));
      }
    } catch (err) {
      console.error("Failed to load lead detail:", err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeadDetail(activeLeadId);
  }, [activeLeadId, fetchLeadDetail]);

  const handleRecordAction = useCallback(
    async (actionType: "note" | "call" | "credit_grant" | "status_change") => {
      if (!activeLead) return;
      setSubmitting(true);
      setGrantError(null);
      try {
        const res = await fetch("/api/admin/leads/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: activeLead.id,
            actionType,
            notes: noteText,
            status: newStatus,
            creditAmount: actionType === "credit_grant" ? creditCount : undefined,
          }),
        });
        if (res.ok) {
          setNoteText("");
          await Promise.all([fetchLeads(), fetchLeadDetail(activeLead.id)]);
        } else if (actionType === "credit_grant") {
          const data = await res.json().catch(() => null);
          setGrantError(data?.error ?? "Failed to grant credits.");
        }
      } catch (err) {
        console.error("Failed to submit agent action:", err);
        if (actionType === "credit_grant") setGrantError("Failed to grant credits.");
      } finally {
        setSubmitting(false);
      }
    },
    [activeLead, noteText, newStatus, creditCount, fetchLeads, fetchLeadDetail]
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span className="text-xs">Loading Sales CRM &amp; Leads…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Sales Agent CRM &amp; Lead Console</h1>
          <p className="text-xs text-white/50 mt-1">Manage Stage 3 qualified leads, record stylist contact logs, and grant Stage 4 bonus try-ons.</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || leads.length === 0}
          className="shrink-0 flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 shrink-0" />
          )}
          {exporting ? "Preparing…" : `Export ${leads.length} lead${leads.length === 1 ? "" : "s"} (Excel)`}
        </button>
      </div>

      {exportError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{exportError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Leads List — capped short on phones so the workspace below stays reachable */}
        <div className="lg:col-span-1 rounded-2xl bg-white/[0.03] border border-white/8 p-3 sm:p-4 flex flex-col gap-3 max-h-[60vh] lg:max-h-[700px] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-white/8">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Active Leads ({leads.length})</span>
          </div>
          {/* Agent search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by phone or CRM id…"
              aria-label="Search leads"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-xs text-white placeholder:text-white/30 focus:border-amber-400/50 focus:outline-none"
            />
          </div>
          {/* Sort control */}
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort leads"
              className="w-full appearance-none rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-xs font-semibold text-white focus:border-amber-400/50 focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-black">
                  Sort: {o.label}
                </option>
              ))}
            </select>
          </div>
          {/* Read/unread filter — is_read flips true once an agent opens the lead */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
            {(["all", "unread", "read"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setReadFilter(f)}
                aria-pressed={readFilter === f}
                className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold capitalize transition-colors ${
                  readFilter === f ? "bg-amber-400 text-black" : "text-white/50 hover:text-white/80"
                }`}
              >
                {f}
                {f === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
              </button>
            ))}
          </div>
          {/* Date range filter (filters on lead creation date) */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              aria-label="From date"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-2.5 text-[11px] text-white focus:border-amber-400/50 focus:outline-none [color-scheme:dark]"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              aria-label="To date"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-2.5 text-[11px] text-white focus:border-amber-400/50 focus:outline-none [color-scheme:dark]"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="self-start -mt-1.5 text-[10px] text-white/40 hover:text-white/70"
            >
              Clear date filter
            </button>
          )}
          {/* Qualified-only toggle: has a phone number and isn't an anonymous guest try-on */}
          <label className="flex items-center gap-2 text-[11px] text-white/60 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={qualifiedOnly}
              onChange={(e) => setQualifiedOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-amber-400"
            />
            Only leads with a phone number (exclude guest try-ons)
          </label>
          {leads.length === 0 ? (
            <p className="text-xs text-white/30 py-8 text-center">No leads created yet.</p>
          ) : (
            leads.map((l) => {
              const isSelected = activeLead?.id === l.id;
              return (
                <div
                  key={l.id}
                  onClick={() => selectLead(l)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? "bg-amber-400/10 border-amber-400 shadow-md"
                      : "bg-white/5 border-white/5 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-1.5 min-w-0 text-xs font-bold text-white truncate">
                      {!l.is_read && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-label="Unread" />
                      )}
                      {l.phone || "Guest Session Lead"}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {hasReturned(l) && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold uppercase">
                          <Flame className="w-3 h-3" /> Returned
                        </span>
                      )}
                      {l.source === "guest_tryon" && !l.phone && (
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 text-[10px] font-semibold uppercase">
                          Guest
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-semibold uppercase">
                        Stage {l.funnel_stage_at_creation}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-white/40">
                    <span>{l.generations_count} try-ons completed</span>
                    <span className="capitalize text-amber-400 font-medium">{l.status}</span>
                  </div>
                  {l.last_activity_at && (
                    <div className="flex items-center gap-1 text-[10px] text-white/30">
                      <Clock className="w-2.5 h-2.5" />
                      <span>Active {timeAgo(l.last_activity_at)}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Lead Workspace & Agent Action Drawer */}
        <div
          ref={workspaceRef}
          className="lg:col-span-2 scroll-mt-20 lg:scroll-mt-0 rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-6"
        >
          {activeLead ? (
            <>
              {/* Active Lead Header */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pb-4 border-b border-white/8 gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 shrink-0 text-amber-400" />
                    <h2 className="text-base font-bold text-white truncate">{activeLead.phone || "Guest Session Lead"}</h2>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5 truncate">
                    Lead ID: <span className="font-mono">{activeLead.id}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden sm:inline text-xs text-white/50">Status:</span>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    aria-label="Lead status"
                    className="flex-1 sm:flex-none min-w-0 px-3 py-2 sm:py-1.5 rounded-lg bg-white/10 border border-white/10 text-white text-xs font-semibold focus:outline-none"
                  >
                    <option value="new" className="bg-black">New</option>
                    <option value="contacted" className="bg-black">Contacted</option>
                    <option value="qualified" className="bg-black">Qualified</option>
                    <option value="converted" className="bg-black">Converted</option>
                    <option value="lost" className="bg-black">Lost</option>
                  </select>
                  <button
                    onClick={() => handleRecordAction("status_change")}
                    disabled={submitting}
                    className="shrink-0 px-4 py-2 sm:py-1.5 rounded-lg bg-amber-400 text-black text-xs font-bold hover:bg-amber-300"
                  >
                    Update
                  </button>
                </div>
              </div>

              {/* Agent Actions: Notes & Stage 4 Credit Grants */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Note Log Box */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-3">
                  <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-400" /> Stylist Call Note
                  </span>
                  <textarea
                    rows={3}
                    placeholder="Record notes from phone consultation..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
                  />
                  <button
                    onClick={() => handleRecordAction("call")}
                    disabled={submitting || !noteText.trim()}
                    className="py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold disabled:opacity-40"
                  >
                    Record Consultation Log
                  </button>
                </div>

                {/* Stage 4 Credit Grant Box */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-400/10 to-rose-500/10 border border-amber-400/20 flex flex-col justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <PlusCircle className="w-3.5 h-3.5 text-amber-400" /> Stage 4 Agent Credit Grant
                    </span>
                    <p className="text-[11px] text-white/50 mt-1">
                      Manually grant additional try-on credits to this customer during or after your phone consultation.
                    </p>
                    <p className="text-[11px] text-white/70 mt-2 font-semibold">
                      {detail
                        ? `${detail.credits.remaining} try-on${detail.credits.remaining === 1 ? "" : "s"} remaining`
                        : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={creditCount}
                      onChange={(e) => setCreditCount(Number(e.target.value))}
                      className="w-20 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-xs text-center font-bold"
                    />
                    <button
                      onClick={() => handleRecordAction("credit_grant")}
                      disabled={submitting}
                      className="flex-1 py-2 rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 text-white text-xs font-bold hover:scale-[1.02] transition-all disabled:opacity-50"
                    >
                      Grant +{creditCount} Try-Ons
                    </button>
                  </div>
                  {grantError && (
                    <p className="text-[11px] text-rose-400 font-medium">{grantError}</p>
                  )}
                </div>
              </div>

              {/* Looks this customer created */}
              <div className="flex flex-col gap-3 pt-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Looks created
                  {detail && <span className="text-white/40 normal-case font-medium">({detail.looks.length})</span>}
                </span>
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-xs text-white/40 py-3">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading looks…
                  </div>
                ) : detail && detail.looks.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {detail.looks.map((look) => (
                      <div key={look.id} className="shrink-0">
                        <div className="flex gap-1">
                          {/* Null for looks generated before source photos were
                              stored — those show the result on its own. */}
                          {look.source_url && (
                            <div className="relative h-28 w-24 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={look.source_url} alt="Customer's photo" className="h-full w-full object-cover" />
                              <span className="absolute bottom-0 inset-x-0 bg-black/60 text-center text-[9px] font-semibold uppercase tracking-wider text-white/70">
                                Before
                              </span>
                            </div>
                          )}
                          <div className="relative h-28 w-24 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                            {look.result_url ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={look.result_url} alt="Customer try-on look" className="h-full w-full object-cover" />
                                {look.source_url && (
                                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-center text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                                    After
                                  </span>
                                )}
                              </>
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-white/30">no image</div>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 truncate text-[10px] text-white/40" style={{ maxWidth: look.source_url ? "12.5rem" : "6rem" }}>
                          {look.products?.name || "Custom look"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/30 py-3">No looks generated yet.</p>
                )}
              </div>

              {/* Products this customer is interested in */}
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-amber-400" /> Interested products
                  {detail && <span className="text-white/40 normal-case font-medium">({detail.interestedProducts.length})</span>}
                </span>
                {!detailLoading && detail && detail.interestedProducts.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {detail.interestedProducts.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 p-2.5">
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-white">{p.name}</p>
                          <p className="text-[11px] text-white/50">
                            {formatMoney((p.selling_price ?? p.price) ?? 0, p.currency ?? undefined)}
                          </p>
                        </div>
                        {p.saved && (
                          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">Saved</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : !detailLoading ? (
                  <p className="text-xs text-white/30 py-3">No product interest recorded yet.</p>
                ) : null}
              </div>

              {/* Customer Feedback */}
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-400" /> Customer feedback
                  {detail && <span className="text-white/40 normal-case font-medium">({detail.feedback.length})</span>}
                </span>
                {!detailLoading && detail && detail.feedback.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {detail.feedback.map((f) => (
                      <div key={f.id} className="rounded-xl border border-white/5 bg-white/5 p-3 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-base">
                            {RATING_EMOJI[f.experience_rating] ?? "•"}{" "}
                            <span className="text-white/60 text-xs font-semibold align-middle">{f.experience_rating}/4</span>
                          </span>
                          <span className="text-[10px] text-white/40">{new Date(f.created_at).toLocaleString()}</span>
                        </div>
                        {f.interest && (
                          <span className="w-fit rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            {INTEREST_LABEL[f.interest] ?? f.interest}
                            {f.products?.name ? ` · ${f.products.name}` : ""}
                          </span>
                        )}
                        {f.improvement && <p className="text-xs text-white/80">“{f.improvement}”</p>}
                      </div>
                    ))}
                  </div>
                ) : !detailLoading ? (
                  <p className="text-xs text-white/30 py-3">No feedback submitted yet.</p>
                ) : null}
              </div>

              {/* Activity Timeline */}
              <div className="flex flex-col gap-3 pt-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-white/50" /> Lead Activity Timeline
                </span>
                <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
                  {activeLead.agent_actions?.length === 0 ? (
                    <p className="text-xs text-white/30 py-4">No follow-up actions recorded yet.</p>
                  ) : (
                    activeLead.agent_actions?.map((a) => (
                      <div key={a.id} className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1 text-xs">
                        <div className="flex items-center justify-between gap-2 flex-wrap text-white/50">
                          <span className="font-semibold uppercase text-[10px] text-amber-400">{a.action_type}</span>
                          <span>{new Date(a.created_at).toLocaleString()}</span>
                        </div>
                        {a.notes && <p className="text-white/80">{a.notes}</p>}
                        {a.credit_amount && (
                          <p className="text-emerald-400 font-semibold">+ Granted {a.credit_amount} bonus try-on credits</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-white/30 gap-2">
              <ShieldAlert className="w-8 h-8" />
              <span className="text-xs">Select a lead from the left sidebar to view details.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
