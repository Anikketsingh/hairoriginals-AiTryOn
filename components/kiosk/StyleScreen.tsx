"use client";

/**
 * Standee style picker — the web app's StyleStep (gender toggle, category
 * chips, product grid, sticky "Try this on" bar) scaled for a portrait
 * touchscreen: 3 large columns, finger-sized chips, no search box (there's
 * no keyboard on a standee).
 */

import { useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { formatMoney } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { KioskLogo, PrimaryButton } from "@/components/kiosk/ui";

type Gender = "all" | "women" | "men";

export default function StyleScreen({
  products,
  categories,
  photoUrl,
  loading,
  error,
  triesLeft,
  onTryOn,
  onRetake,
}: {
  products: Product[];
  categories: Category[];
  photoUrl?: string;
  /** True while the chosen style's image is being fetched for the try-on. */
  loading: boolean;
  error: string | null;
  triesLeft: number;
  /** Second argument true = dev-only demo (no AI call). */
  onTryOn: (product: Product, demo?: boolean) => void;
  onRetake: () => void;
}) {
  const [gender, setGender] = useState<Gender>("all");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);

  const genderProducts = useMemo(
    () => products.filter((p) => gender === "all" || !p.gender || p.gender === gender || p.gender === "unisex"),
    [products, gender]
  );
  // Only offer categories that actually have something to show for this gender.
  const visibleCategories = useMemo(() => {
    const used = new Set(genderProducts.map((p) => p.category_id));
    return categories.filter((c) => used.has(c.id));
  }, [categories, genderProducts]);
  const visible = categoryId ? genderProducts.filter((p) => p.category_id === categoryId) : genderProducts;

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* Header: their photo + title */}
      <div className="flex items-center gap-8 px-12 pt-[3.5vh]">
        {photoUrl && (
          <div className="relative h-[180px] w-[135px] shrink-0 overflow-hidden rounded-[28px] border-4 border-surface shadow-[var(--shadow-pop)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Your photo" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <KioskLogo className="mb-3 h-10" />
          <h1 className="text-[56px] font-extrabold leading-none tracking-tight text-ink">Choose your style</h1>
          <p className="mt-3 text-[28px] text-ink-soft">
            Tap a look to try it on · {triesLeft} {triesLeft === 1 ? "try" : "tries"} left
          </p>
        </div>
        <button
          type="button"
          onClick={onRetake}
          className="flex shrink-0 flex-col items-center gap-2 rounded-[28px] px-4 py-3 text-[22px] font-semibold text-ink-soft active:scale-95"
        >
          <RefreshCw className="h-10 w-10" /> Retake
        </button>
      </div>

      {/* Filters */}
      <div className="mt-8 flex items-center gap-4 px-12">
        <div className="flex shrink-0 rounded-full border border-line bg-surface p-1.5 shadow-[var(--shadow-card)]">
          {(["all", "women", "men"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                setGender(g);
                setCategoryId(null);
              }}
              className={cn(
                "min-h-[76px] rounded-full px-9 text-[26px] font-bold capitalize transition-colors",
                gender === g ? "bg-brand text-white" : "text-ink-soft"
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto px-12 pb-2">
        <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
          All styles
        </Chip>
        {visibleCategories.map((c) => (
          <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>

      {/* Grid */}
      <div className="no-scrollbar mt-6 flex-1 overflow-y-auto overscroll-contain px-12 pb-[260px]">
        {products.length === 0 ? (
          <div className="grid grid-cols-3 gap-6">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-[32px] bg-surface-sunken" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="pt-24 text-center text-[30px] text-ink-soft">No styles here yet — try another category.</p>
        ) : (
          <div className="grid grid-cols-3 gap-6">
            {visible.map((p) => {
              const isSelected = selected?.id === p.id;
              const price = p.selling_price || p.price || 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  className={cn(
                    "relative flex flex-col overflow-hidden rounded-[32px] border-[3px] bg-surface text-left shadow-[var(--shadow-card)] transition-all active:scale-[0.98]",
                    isSelected ? "border-brand ring-8 ring-brand/20" : "border-transparent"
                  )}
                >
                  <div className="relative aspect-[3/4] w-full bg-surface-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image_url} alt={p.name} draggable={false} className="h-full w-full object-cover" />
                    {p.is_best_seller && (
                      <span className="absolute left-4 top-4 rounded-full bg-brand px-4 py-1.5 text-[18px] font-bold text-white">
                        Bestseller
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute right-4 top-4 flex h-14 w-14 animate-scale-in items-center justify-center rounded-full bg-brand text-white shadow-lg">
                        <Check className="h-8 w-8 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-5">
                    <p className="line-clamp-2 min-h-[64px] text-[24px] font-semibold leading-tight text-ink">{p.name}</p>
                    {price > 0 && (
                      <p className="text-[24px] font-bold text-ink">
                        {formatMoney(price, p.currency ?? undefined)}
                        {p.mrp && p.mrp > price && (
                          <span className="ml-3 text-[20px] font-normal text-ink-faint line-through">
                            {formatMoney(p.mrp, p.currency ?? undefined)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky try-on bar */}
      <div className="absolute inset-x-0 bottom-0 border-t border-line bg-surface/85 px-12 pb-[4vh] pt-8 backdrop-blur-2xl">
        {error && <p className="mb-4 text-center text-[26px] font-medium text-danger">{error}</p>}
        <div className="flex items-center gap-6">
          {selected && (
            <div className="h-[112px] w-[84px] shrink-0 overflow-hidden rounded-2xl border-2 border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.image_url} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          {/* DEV ONLY: walk the flow without the paid AI call — the server echoes
              the photo back. Never rendered in a production build, and the
              server ignores the demo flag outside development anyway. */}
          {process.env.NODE_ENV !== "production" && (
            <button
              type="button"
              disabled={!selected || loading}
              onClick={() => selected && onTryOn(selected, true)}
              className="shrink-0 rounded-full border-2 border-dashed border-amber-500 bg-amber-100 px-7 py-5 text-[22px] font-bold text-amber-900 active:scale-95 disabled:opacity-40"
            >
              Demo · skip AI
            </button>
          )}
          <PrimaryButton className="flex-1" disabled={!selected || loading} onClick={() => selected && onTryOn(selected)}>
            {loading ? <Loader2 className="h-10 w-10 animate-spin" /> : <Sparkles className="h-10 w-10" />}
            {selected ? (loading ? "Getting ready…" : "Try this on") : "Pick a style above"}
            {selected && !loading && <ArrowRight className="h-10 w-10" />}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[72px] shrink-0 whitespace-nowrap rounded-full border-2 px-8 text-[24px] font-semibold transition-colors",
        active ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-soft"
      )}
    >
      {children}
    </button>
  );
}
