"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Loader2,
  CheckCircle,
  AlertCircle,
  Ban,
  Mail,
  Lock,
  KeyRound,
} from "lucide-react";
import type { AdminRole } from "@/lib/admin-auth";

interface AdminEntry {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: "active" | "suspended";
  linked: boolean;
  isSelf: boolean;
}

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  content_manager: "Content Manager",
  sales_agent: "Sales Agent",
};

const ROLE_OPTIONS: AdminRole[] = ["super_admin", "content_manager", "sales_agent"];

export default function TeamAccessPage() {
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "content_manager" as AdminRole,
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/team");
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins ?? []);
      } else {
        setError("Failed to load the team.");
      }
    } catch {
      setError("Failed to load the team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
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
      setSuccess(null);
      try {
        const res = await fetch("/api/admin/team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (res.ok) {
          flashSuccess(`Admin "${form.name}" created. They can log in now.`);
          setForm({ name: "", email: "", password: "", role: "content_manager" });
          load();
        } else {
          setError(data.error || "Failed to create the admin.");
        }
      } catch {
        setError("Failed to create the admin.");
      } finally {
        setCreating(false);
      }
    },
    [form, load]
  );

  const patchAdmin = useCallback(
    async (id: string, body: { role?: AdminRole; status?: "active" | "suspended" }) => {
      setRowBusy(id);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch("/api/admin/team", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...body }),
        });
        const data = await res.json();
        if (res.ok) {
          setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, ...data.admin } : a)));
          flashSuccess("Admin updated.");
        } else {
          setError(data.error || "Failed to update the admin.");
        }
      } catch {
        setError("Failed to update the admin.");
      } finally {
        setRowBusy(null);
      }
    },
    []
  );

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Users className="w-6 h-6 text-amber-400" />
          Team &amp; Access
        </h1>
        <p className="text-xs text-white/50 mt-1">
          Create and manage admin accounts. Super Admin only.
        </p>
      </div>

      {/* Alerts */}
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

      {/* Create Admin */}
      <form
        onSubmit={handleCreate}
        className="rounded-2xl bg-white/[0.03] border border-white/8 p-6 flex flex-col gap-5"
      >
        <div className="flex items-center gap-2 pb-3 border-b border-white/8">
          <UserPlus className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Add Admin</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60">Full Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Jane Doe"
              className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60 flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> Email
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@hairoriginals.com"
              className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60 flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> Temporary Password
            </label>
            <input
              type="text"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="At least 8 characters"
              className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-white/60 flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3" /> Role
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
              className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r} className="bg-[#141414]">
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] text-white/35 flex items-center gap-1.5">
            <KeyRound className="w-3 h-3" /> Share the temporary password securely; ask them to change it after first login.
          </p>
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-white font-semibold text-xs shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shrink-0"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {creating ? "Creating…" : "Create Admin"}
          </button>
        </div>
      </form>

      {/* Team List */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/8 overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-white/8">
          <Users className="w-4 h-4 text-rose-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Current Admins {!loading && `(${admins.length})`}
          </h2>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/40 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
            <span className="text-xs">Loading team…</span>
          </div>
        ) : admins.length === 0 ? (
          <div className="py-16 text-center text-xs text-white/40">No admins yet.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {admins.map((a) => {
              const busy = rowBusy === a.id;
              return (
                <div
                  key={a.id}
                  className="flex flex-col md:flex-row md:items-center gap-4 px-6 py-4"
                >
                  {/* Identity */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        a.status === "active" && a.linked
                          ? "bg-emerald-400"
                          : a.status === "suspended"
                            ? "bg-red-400"
                            : "bg-amber-400"
                      }`}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-white font-medium truncate">
                        {a.name}
                        {a.isSelf && <span className="text-white/40 font-normal"> (you)</span>}
                      </span>
                      <span className="text-[11px] text-white/40 truncate">{a.email}</span>
                    </div>
                  </div>

                  {/* Status badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!a.linked && (
                      <span className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold uppercase tracking-wide">
                        No login
                      </span>
                    )}
                    {a.status === "suspended" && (
                      <span className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-semibold uppercase tracking-wide">
                        Suspended
                      </span>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={a.role}
                      disabled={busy || a.isSelf}
                      onChange={(e) => patchAdmin(a.id, { role: e.target.value as AdminRole })}
                      className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r} className="bg-[#141414]">
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>

                    <button
                      disabled={busy || a.isSelf}
                      onClick={() =>
                        patchAdmin(a.id, {
                          status: a.status === "active" ? "suspended" : "active",
                        })
                      }
                      title={a.isSelf ? "You can't change your own status" : undefined}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        a.status === "active"
                          ? "bg-white/5 hover:bg-red-500/10 border-white/10 hover:border-red-500/20 text-white/70 hover:text-red-400"
                          : "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      {busy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : a.status === "active" ? (
                        <Ban className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      {a.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
