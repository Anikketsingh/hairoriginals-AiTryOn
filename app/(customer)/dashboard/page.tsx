"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Download, Share2, Sparkles, Zap, Phone, ArrowRight, Bookmark } from "lucide-react";
import TopBar from "@/components/flow/TopBar";
import BottomNav from "@/components/BottomNav";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/hooks/useSession";

interface GenerationHistoryItem {
  id: string;
  status: string;
  result_image_base64: string | null;
  result_mime_type: string | null;
  created_at: string;
  products: { id: string; name: string; image_url: string; price: number | null } | null;
}

interface SavedProductItem {
  id: string;
  products: { id: string; name: string; slug: string; image_url: string; price: number | null; description: string | null };
}

const STAGE_HINT: Record<number, string> = {
  0: "Sign in to unlock more free try-ons",
  1: "Sign in to unlock more free try-ons",
  2: "You're all set — keep exploring looks!",
  3: "Talk to a stylist to unlock more try-ons",
};

export default function CustomerDashboardPage() {
  const { sessionStatus, sessionToken, sessionLoading } = useSession();
  const { toast } = useToast();
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [savedProducts, setSavedProducts] = useState<SavedProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [histRes, savedRes] = await Promise.all([
        fetch(`/api/customer/history?sessionToken=${sessionToken}`),
        fetch(`/api/customer/saved?sessionToken=${sessionToken}`),
      ]);
      if (histRes.ok) setHistory(await histRes.json());
      if (savedRes.ok) setSavedProducts(await savedRes.json());
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleDownload = (base64: string, mimeType: string, id: string) => {
    const link = document.createElement("a");
    link.href = `data:${mimeType};base64,${base64}`;
    link.download = `hairoriginals-look-${id.slice(0, 8)}.jpg`;
    link.click();
    toast("Saved to your device", "success");
  };

  const handleShare = async (base64: string, mimeType: string) => {
    try {
      const res = await fetch(`data:${mimeType};base64,${base64}`);
      const blob = await res.blob();
      const file = new File([blob], `hairoriginals-look.${mimeType.split("/")[1] ?? "png"}`, { type: mimeType });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My HairOriginals look" });
        return;
      }
      handleDownload(base64, mimeType, "share");
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast("Couldn't share right now", "error");
    }
  };

  const creditsRemaining = sessionStatus?.creditsRemaining ?? 0;
  const stage = sessionStatus?.stage ?? 0;
  const busy = loading || sessionLoading;

  return (
    <>
      <TopBar title="My Looks" />
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-7 px-5 pt-20 pb-28">
        {/* Friendly credit header */}
        <section className="overflow-hidden rounded-[var(--radius-xl)] border border-line bg-gradient-to-br from-brand-soft to-surface p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-bold text-ink shadow-[var(--shadow-card)]">
              <Zap className="h-4 w-4 text-brand" />
              {creditsRemaining} {creditsRemaining === 1 ? "try-on" : "try-ons"} left
            </span>
            {sessionStatus?.userId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success">
                <Phone className="h-3 w-3" /> Signed in
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-ink-soft">{STAGE_HINT[stage]}</p>
          <div className="mt-4">
            <Link href="/">
              <Button size="md" rightIcon={<ArrowRight className="h-4 w-4" />}>
                New try-on
              </Button>
            </Link>
          </div>
        </section>

        {/* History gallery */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-bold tracking-tight text-ink">Your looks</h2>
            {!busy && history.length > 0 && (
              <span className="text-sm font-medium text-ink-faint">({history.length})</span>
            )}
          </div>

          {busy ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full" rounded="rounded-[var(--radius-lg)]" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Sparkles className="h-7 w-7" />
              </div>
              <p className="text-sm font-semibold text-ink">No looks yet</p>
              <p className="max-w-[15rem] text-xs text-ink-soft">
                Add a selfie and pick a style to see your first AI hair try-on.
              </p>
              <Link href="/" className="mt-1">
                <Button size="md" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Try a hairstyle
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-card)]"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-surface-sunken">
                    {item.result_image_base64 && item.result_mime_type ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:${item.result_mime_type};base64,${item.result_image_base64}`}
                        alt="AI try-on result"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-ink-faint">{item.status}</div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-ink backdrop-blur-md">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 p-2.5">
                    <span className="line-clamp-1 text-[13px] font-semibold text-ink">
                      {item.products?.name || "Custom look"}
                    </span>
                    {item.result_image_base64 && item.result_mime_type && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleShare(item.result_image_base64!, item.result_mime_type!)}
                          aria-label="Share look"
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-line bg-surface py-2 text-xs font-semibold text-ink-soft transition hover:bg-surface-sunken active:scale-95"
                        >
                          <Share2 className="h-3.5 w-3.5" /> Share
                        </button>
                        <button
                          onClick={() => handleDownload(item.result_image_base64!, item.result_mime_type!, item.id)}
                          aria-label="Download look"
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-line bg-surface py-2 text-xs font-semibold text-ink-soft transition hover:bg-surface-sunken active:scale-95"
                        >
                          <Download className="h-3.5 w-3.5" /> Save
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Saved favorites */}
        {!busy && savedProducts.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-bold tracking-tight text-ink">Saved styles</h2>
              <span className="text-sm font-medium text-ink-faint">({savedProducts.length})</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {savedProducts.map((sp) => (
                <Link
                  key={sp.id}
                  href="/"
                  className="group flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-card)] transition active:scale-[0.98]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sp.products.image_url}
                    alt={sp.products.name}
                    className="aspect-square w-full object-cover"
                  />
                  <div className="flex items-center justify-between gap-1 p-2.5">
                    <span className="line-clamp-1 text-[13px] font-semibold text-ink">{sp.products.name}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-brand" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <BottomNav />
    </>
  );
}
