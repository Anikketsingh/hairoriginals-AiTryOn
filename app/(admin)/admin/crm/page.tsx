"use client";

import { useEffect, useState, useCallback } from "react";
import { UserCheck, Phone, MessageSquare, PlusCircle, CheckCircle, Loader2, Clock, ShieldAlert } from "lucide-react";

interface Lead {
  id: string;
  phone: string | null;
  funnel_stage_at_creation: number;
  generations_count: number;
  status: string;
  source: string;
  created_at: string;
  agent_actions: {
    id: string;
    action_type: string;
    notes: string | null;
    credit_amount: number | null;
    created_at: string;
  }[];
}

export default function SalesCRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [noteText, setNoteText] = useState("");
  const [newStatus, setNewStatus] = useState("contacted");
  const [creditCount, setCreditCount] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/leads");
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
        if (data.length > 0 && !activeLead) setActiveLead(data[0]);
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      setLoading(false);
    }
  }, [activeLead]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleRecordAction = useCallback(
    async (actionType: "note" | "call" | "credit_grant" | "status_change") => {
      if (!activeLead) return;
      setSubmitting(true);
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
          await fetchLeads();
        }
      } catch (err) {
        console.error("Failed to submit agent action:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [activeLead, noteText, newStatus, creditCount, fetchLeads]
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
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Sales Agent CRM &amp; Lead Console</h1>
        <p className="text-xs text-white/50 mt-1">Manage Stage 3 qualified leads, record stylist contact logs, and grant Stage 4 bonus try-ons.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads List */}
        <div className="lg:col-span-1 rounded-2xl bg-white/[0.03] border border-white/8 p-4 flex flex-col gap-3 max-h-[700px] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-white/8">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Active Leads ({leads.length})</span>
          </div>
          {leads.length === 0 ? (
            <p className="text-xs text-white/30 py-8 text-center">No leads created yet.</p>
          ) : (
            leads.map((l) => {
              const isSelected = activeLead?.id === l.id;
              return (
                <div
                  key={l.id}
                  onClick={() => setActiveLead(l)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? "bg-amber-400/10 border-amber-400 shadow-md"
                      : "bg-white/5 border-white/5 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{l.phone || "Guest Session Lead"}</span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-semibold uppercase">
                      Stage {l.funnel_stage_at_creation}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-white/40">
                    <span>{l.generations_count} try-ons completed</span>
                    <span className="capitalize text-amber-400 font-medium">{l.status}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Lead Workspace & Agent Action Drawer */}
        <div className="lg:col-span-2 rounded-2xl bg-white/[0.03] border border-white/8 p-6 flex flex-col gap-6">
          {activeLead ? (
            <>
              {/* Active Lead Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-white/8 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-bold text-white">{activeLead.phone || "Guest Session Lead"}</h2>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">
                    Lead ID: <span className="font-mono">{activeLead.id}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/50">Status:</span>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-white text-xs font-semibold focus:outline-none"
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
                    className="px-3 py-1.5 rounded-lg bg-amber-400 text-black text-xs font-bold hover:bg-amber-300"
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
                </div>
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
                        <div className="flex items-center justify-between text-white/50">
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
