"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Shield, Mail, Lock, Loader2 } from "lucide-react";
import { supabaseAdminBrowserClient } from "@/lib/supabase/admin-browser-client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const { error: signInError } =
          await supabaseAdminBrowserClient.auth.signInWithPassword({
            email,
            password,
          });
        if (signInError) throw signInError;

        router.push("/admin");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign in failed.");
      } finally {
        setLoading(false);
      }
    },
    [email, password, router]
  );

  return (
    <div className="admin-ui flex min-h-screen items-center justify-center bg-[#060606] px-4 py-10 sm:px-6 pt-safe pb-safe">
      <div className="w-full max-w-sm rounded-2xl border border-white/8 bg-white/[0.03] p-6 sm:p-8">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-500 shadow-lg shadow-rose-500/25">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">HairOriginals</p>
            <div className="mt-0.5 flex items-center justify-center gap-1">
              <Shield className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Admin Console
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-white/60">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400/50 focus:outline-none"
                placeholder="you@hairoriginals.com"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-semibold text-white/60">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400/50 focus:outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition-opacity disabled:opacity-40"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
