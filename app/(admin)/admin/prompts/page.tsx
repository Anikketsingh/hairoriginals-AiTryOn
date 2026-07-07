"use client";

import { useEffect, useState, useCallback } from "react";
import { BookOpen, Save, CheckCircle, Loader2, History } from "lucide-react";

interface PromptTemplate {
  id: string;
  name: string;
  slug: string;
  template: string;
  version: number;
  is_active: boolean;
}

export default function PromptLibraryPage() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPrompts() {
      try {
        const res = await fetch("/api/admin/prompts");
        if (res.ok) setPrompts(await res.json());
      } catch (err) {
        console.error("Failed to load prompts:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPrompts();
  }, []);

  const handleUpdatePrompt = useCallback(async (id: string, newTemplate: string) => {
    setSavingId(id);
    try {
      const res = await fetch("/api/admin/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, template: newTemplate }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPrompts((prev) => prev.map((p) => (p.id === id ? updated : p)));
        setSavedId(id);
        setTimeout(() => setSavedId(null), 2500);
      }
    } catch (err) {
      console.error("Failed to update prompt:", err);
    } finally {
      setSavingId(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span className="text-xs">Loading Prompt Library…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Prompt Library &amp; Versioning</h1>
        <p className="text-xs text-white/50 mt-1">Manage system prompts for AI try-on generation. Edits automatically increment template versions.</p>
      </div>

      <div className="flex flex-col gap-6">
        {prompts.map((p) => (
          <div key={p.id} className="rounded-2xl bg-white/[0.03] border border-white/8 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-white">{p.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 font-mono text-white/60">
                  slug: {p.slug}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-amber-400/80 font-medium flex items-center gap-1">
                  <History className="w-3.5 h-3.5" /> v{p.version}
                </span>
                {savedId === p.id && (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1 animate-fade-in">
                    <CheckCircle className="w-3.5 h-3.5" /> Saved
                  </span>
                )}
              </div>
            </div>

            <textarea
              rows={3}
              value={p.template}
              onChange={(e) => {
                const val = e.target.value;
                setPrompts((prev) => prev.map((item) => (item.id === p.id ? { ...item, template: val } : item)));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs leading-relaxed font-mono focus:outline-none focus:border-amber-400/50"
            />

            <div className="flex justify-end">
              <button
                onClick={() => handleUpdatePrompt(p.id, p.template)}
                disabled={savingId === p.id}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-semibold transition-all disabled:opacity-40"
              >
                {savingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Prompt Version
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
