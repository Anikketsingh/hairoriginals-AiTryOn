"use client";

/**
 * components/admin/VaultGallery.tsx
 *
 * The vault UI: a password prompt, then a flat wall of every customer photo
 * and generated look the platform has ever produced, plus a one-click export
 * of all of it.
 *
 * "Uncategorised" is the point — no grouping by lead, user, or product, just
 * newest-first tiles. Source photos are emitted immediately before the look
 * they produced, so before/after pairs stay adjacent without imposing any
 * structure on the grid.
 *
 * The export is batched (see the download route for why). This keeps that
 * invisible: one click walks every batch in turn and hands each finished
 * archive to the browser's download manager, never holding one in memory.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  Download,
  ImageIcon,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  ExportCancelled,
  exportVaultToFile,
  supportsDirectExport,
  type VaultExportProgress,
} from "@/lib/vault-export";

interface VaultItem {
  id: string;
  generationId: string;
  kind: "source" | "result";
  createdAt: string;
  archiveName: string;
  url: string;
}

interface VaultTotals {
  sources: number;
  results: number;
  images: number;
  generations: number;
}

interface GalleryResponse {
  kind: KindFilter;
  totals: VaultTotals | null;
  exportBatch: number;
  items: VaultItem[];
  nextOffset: number | null;
}

type KindFilter = "all" | "source" | "result";

const KIND_TABS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "source", label: "Customer photos" },
  { value: "result", label: "Generated looks" },
];

/**
 * Fallback path only. Consecutive archives are handed to the browser this far
 * apart; anchor-triggered downloads give no completion signal, so this is a
 * pace rather than a wait. Each batch is an independent, complete ZIP, so
 * overlapping them is harmless — the delay just keeps the download manager and
 * our function concurrency from being hit all at once.
 */
const EXPORT_PACE_MS = 3000;

/** Mirrors VAULT_EXPORT_BATCH until the first gallery response arrives. */
const ASSUMED_EXPORT_BATCH = 25;

type ExportState =
  | { mode: "direct"; written: number; skipped: number }
  | { mode: "batched"; done: number; total: number };

export default function VaultGallery({ pathKey }: { pathKey: string }) {
  const [status, setStatus] = useState<"checking" | "locked" | "ready" | "error">("checking");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [kind, setKind] = useState<KindFilter>("all");
  const [items, setItems] = useState<VaultItem[]>([]);
  const [totals, setTotals] = useState<VaultTotals | null>(null);
  const [exportBatch, setExportBatch] = useState<number>(ASSUMED_EXPORT_BATCH);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState<VaultExportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const batchAbort = useRef(false);

  // Whether this browser can stream straight to a file. Read through
  // useSyncExternalStore (with a `false` server snapshot) rather than during
  // render, so the server and client markup agree at hydration. It's a fixed
  // browser capability, so there's nothing to subscribe to.
  const directExport = useSyncExternalStore(
    () => () => {},
    supportsDirectExport,
    () => false
  );

  const api = useCallback(
    (route: string) => `/api/admin/vault/${encodeURIComponent(pathKey)}/${route}`,
    [pathKey]
  );

  /** Loads a page. `offset === 0` also (re)seeds the totals. */
  const loadPage = useCallback(
    async (targetKind: KindFilter, offset: number) => {
      const res = await fetch(api(`gallery?kind=${targetKind}&offset=${offset}`));

      if (res.status === 401) {
        setStatus("locked");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }

      const data = (await res.json()) as GalleryResponse;
      setItems((previous) => (offset === 0 ? data.items : [...previous, ...data.items]));
      if (data.totals) setTotals(data.totals);
      setExportBatch(data.exportBatch);
      setNextOffset(data.nextOffset);
      setStatus("ready");
    },
    [api]
  );

  // Initial probe doubles as the lock check: the gallery route answers 401
  // until the vault has been unlocked this session. Deliberately loads the
  // default filter rather than `kind` — later filter changes go through
  // selectKind, which shows a spinner while it refetches.
  useEffect(() => {
    async function open() {
      try {
        await loadPage("all", 0);
      } catch {
        setStatus("error");
      }
    }
    open();
  }, [loadPage]);

  // Abandon an export in flight if the tab navigates away mid-run.
  useEffect(() => {
    return () => {
      batchAbort.current = true;
      abortRef.current?.abort();
    };
  }, []);

  async function handleUnlock(event: React.FormEvent) {
    event.preventDefault();
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await fetch(api("unlock"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setUnlockError(body?.error ?? "Incorrect password.");
        return;
      }
      setPassword("");
      setStatus("checking");
      await loadPage(kind, 0);
    } catch {
      setUnlockError("Could not reach the server. Try again.");
    } finally {
      setUnlocking(false);
    }
  }

  async function handleLock() {
    cancelExport();
    await fetch(api("unlock"), { method: "DELETE" }).catch(() => {});
    setItems([]);
    setTotals(null);
    setStatus("locked");
  }

  async function selectKind(nextKind: KindFilter) {
    if (nextKind === kind) return;
    setKind(nextKind);
    setStatus("checking");
    setItems([]);
    setNextOffset(null);
    await loadPage(nextKind, 0).catch(() => setStatus("error"));
  }

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(kind, nextOffset);
    } catch {
      setStatus("error");
    } finally {
      setLoadingMore(false);
    }
  }

  function cancelExport() {
    batchAbort.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    setExportState(null);
  }

  function triggerDownload(url: string) {
    const anchor = document.createElement("a");
    anchor.href = url;
    // Same-origin, so the browser honours this and saves rather than navigates.
    anchor.download = "";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  /**
   * Primary path: one archive, written straight to a file the user picks, with
   * images pulled from Storage by the browser. No server in the byte path, so
   * nothing here is bounded by a function timeout.
   */
  async function exportDirect() {
    const controller = new AbortController();
    abortRef.current = controller;
    setExportState({ mode: "direct", written: 0, skipped: 0 });

    try {
      const result = await exportVaultToFile({
        api,
        kind,
        signal: controller.signal,
        onProgress: (progress) => setExportState({ mode: "direct", ...progress }),
      });
      setExportDone(result);
    } catch (err) {
      // Dismissing the save dialog is a decision, not a failure.
      if (!(err instanceof ExportCancelled)) {
        setExportError(err instanceof Error ? err.message : "Export failed.");
      }
    } finally {
      abortRef.current = null;
      setExportState(null);
    }
  }

  /**
   * Fallback for browsers without the File System Access API: the server
   * streams the library as a run of small ZIPs. Still one click, but it lands
   * as many files and each one is bounded by the function's time budget.
   */
  async function exportBatched() {
    if (!totals) return;
    const parts = Math.max(1, Math.ceil(totals.generations / exportBatch));

    batchAbort.current = false;
    setExportState({ mode: "batched", done: 0, total: parts });

    for (let part = 0; part < parts; part++) {
      if (batchAbort.current) return;
      triggerDownload(
        api(`download?kind=${kind}&offset=${part * exportBatch}&limit=${exportBatch}`)
      );
      setExportState({ mode: "batched", done: part + 1, total: parts });
      if (part < parts - 1) {
        await new Promise((resolve) => setTimeout(resolve, EXPORT_PACE_MS));
      }
    }

    setExportState(null);
  }

  async function handleDownloadAll() {
    if (!totals || exportState) return;
    setExportError(null);
    setExportDone(null);
    // Must dispatch synchronously enough that the save dialog still counts as
    // user-initiated — exportDirect opens it before its first await.
    await (directExport ? exportDirect() : exportBatched());
  }

  // ── Locked ──────────────────────────────────────────────────
  if (status === "locked") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <form
          onSubmit={handleUnlock}
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
        >
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-500 shadow-lg shadow-rose-500/25">
              <Lock className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Vault locked</h1>
              <p className="mt-1 text-xs text-white/50">
                Enter the vault password to view and export every try-on image.
              </p>
            </div>
          </div>

          <label htmlFor="vault-password" className="sr-only">
            Vault password
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              id="vault-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              autoFocus
              placeholder="Vault password"
              className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/25 focus:border-amber-400/50 focus:outline-none"
            />
          </div>

          {unlockError && (
            <p className="mt-3 flex items-center gap-2 text-xs text-red-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {unlockError}
            </p>
          )}

          <button
            type="submit"
            disabled={unlocking || password.length === 0}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 py-3 text-xs font-bold text-black transition-all disabled:opacity-40"
          >
            {unlocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Unlock vault
          </button>
        </form>
      </div>
    );
  }

  // ── Failed ──────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
        <AlertCircle className="h-4 w-4 text-red-400" />
        <span>Failed to load the vault. Reload the page and try again.</span>
      </div>
    );
  }

  const isFirstLoad = status === "checking" && items.length === 0;

  // ── Unlocked ────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-white/8 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
            <Sparkles className="h-5 w-5 text-amber-400" />
            Image Vault
          </h1>
          <p className="mt-1 text-xs text-white/50">
            {totals
              ? `${totals.images.toLocaleString()} images across ${totals.generations.toLocaleString()} try-ons — ${totals.sources.toLocaleString()} customer photos, ${totals.results.toLocaleString()} generated looks.`
              : "Every customer photo and generated look, newest first."}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <button
            onClick={handleDownloadAll}
            disabled={!totals || totals.images === 0 || exportState !== null}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-4 py-3 text-xs font-bold text-black transition-all disabled:opacity-40 md:py-2.5"
          >
            {exportState ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 shrink-0" />
            )}
            {exportState?.mode === "direct"
              ? `Archiving ${exportState.written.toLocaleString()}${totals ? ` of ${totals.images.toLocaleString()}` : ""}…`
              : exportState?.mode === "batched"
                ? `Sending archive ${exportState.done} of ${exportState.total}…`
                : `Download all${totals ? ` (${totals.images.toLocaleString()})` : ""}`}
          </button>
          {exportState ? (
            <button
              onClick={cancelExport}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold text-white/70 transition-all hover:bg-white/10 hover:text-white md:py-2.5"
            >
              <X className="h-3.5 w-3.5 shrink-0" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleLock}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold text-white/70 transition-all hover:bg-white/10 hover:text-white md:py-2.5"
            >
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Lock
            </button>
          )}
        </div>
      </header>

      {exportState?.mode === "direct" && (
        <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-200/80">
          Writing every image into the ZIP you chose, straight to disk — keep
          this tab open until it finishes.
          {exportState.skipped > 0 &&
            ` ${exportState.skipped.toLocaleString()} could not be read and were skipped.`}
        </p>
      )}

      {exportState?.mode === "batched" && (
        <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-200/80">
          This browser can&apos;t write a single archive, so the library comes as{" "}
          {exportState.total} ZIP files instead. Allow multiple downloads when
          asked, and keep this tab open until the count finishes. Chrome or Edge
          would download all {totals?.images.toLocaleString()} images as one file.
        </p>
      )}

      {exportDone && (
        <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-200/80">
          Saved {exportDone.written.toLocaleString()} images.
          {exportDone.skipped > 0 &&
            ` ${exportDone.skipped.toLocaleString()} could not be read and were skipped.`}
        </p>
      )}

      {exportError && (
        <p className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {exportError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {KIND_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => selectKind(tab.value)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              kind === tab.value
                ? "border border-amber-400/30 bg-gradient-to-r from-amber-400/20 to-rose-500/20 text-amber-300"
                : "border border-white/10 bg-white/5 text-white/50 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isFirstLoad ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/40">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
          <span className="text-xs">Loading the vault…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/40">
          <ImageIcon className="h-8 w-8" />
          <span className="text-xs">No images yet.</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${item.kind === "source" ? "Customer photo" : "Generated look"} — ${new Date(item.createdAt).toLocaleString()}`}
                className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.kind === "source" ? "Customer photo" : "Generated look"}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span
                  className={`absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm ${
                    item.kind === "source"
                      ? "bg-black/60 text-white/70"
                      : "bg-amber-400/80 text-black"
                  }`}
                >
                  {item.kind === "source" ? (
                    <UserRound className="h-2.5 w-2.5" />
                  ) : (
                    <Sparkles className="h-2.5 w-2.5" />
                  )}
                  {item.kind === "source" ? "Photo" : "Look"}
                </span>
                <span className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-4 text-[10px] text-white/70 transition-transform duration-200 group-hover:translate-y-0">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </a>
            ))}
          </div>

          {nextOffset !== null && (
            <div className="flex justify-center pb-4">
              <button
                onClick={loadMore}
                disabled={loadingMore || status === "checking"}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-semibold text-white/70 transition-all hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
