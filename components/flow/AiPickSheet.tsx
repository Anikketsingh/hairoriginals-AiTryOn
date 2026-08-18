"use client";

import { ChevronRight, Loader2, Sparkles } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import Badge from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { formatMoney } from "@/lib/format";
import type { Product, SuggestResponse } from "@/lib/types";

interface AiPickSheetProps {
  open: boolean;
  suggestion: SuggestResponse | null;
  /** Product id currently being prepared for try-on, if any. */
  busyProductId?: string | null;
  onPick: (product: Product, rank: number) => void;
  onClose: () => void;
}

export default function AiPickSheet({
  open,
  suggestion,
  busyProductId,
  onPick,
  onClose,
}: AiPickSheetProps) {
  if (!suggestion) return null;

  const { analysis, matches } = suggestion;
  // Every analysis field is free text from the model; a blank one is simply
  // not shown rather than rendering an empty chip.
  const traits = [analysis.faceShape, analysis.hairType, analysis.skinTone].filter(
    (t) => t && t.trim() !== ""
  );

  return (
    <Sheet open={open} onClose={onClose} title="Your best matches">
      {analysis.summary?.trim() && (
        <p className="mb-3 flex items-start gap-2 text-sm text-ink-soft">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span>{analysis.summary}</span>
        </p>
      )}

      {traits.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {traits.map((t) => (
            <Badge key={t} tone="neutral" className="capitalize">
              {t}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {matches.map(({ product, rank, reason }) => {
          const price = product.selling_price || product.price || 0;
          const best = rank === 1;
          const busy = busyProductId === product.id;
          return (
            <button
              type="button"
              key={product.id}
              disabled={!!busyProductId}
              onClick={() => onPick(product, rank)}
              className={cn(
                "group flex items-start gap-3 rounded-[var(--radius-lg)] border bg-surface p-3 text-left transition-all active:scale-[0.98] disabled:opacity-60",
                // Rank 1 gets the same treatment a selected card gets on the
                // style grid, so "best match" reads as already-chosen.
                best
                  ? "border-brand ring-2 ring-brand/30 shadow-[var(--shadow-card)]"
                  : "border-line hover:border-line-strong"
              )}
            >
              <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/85 text-[10px] font-bold text-white backdrop-blur-sm">
                  {rank}
                </span>
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-brand" />
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <p className="line-clamp-1 text-[14px] font-semibold text-ink">{product.name}</p>
                  {best && <Badge tone="brand">Best match</Badge>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-ink">
                    {formatMoney(price, product.currency ?? undefined)}
                  </span>
                  {product.mrp && product.mrp > price && (
                    <span className="text-xs text-ink-faint line-through">
                      {formatMoney(product.mrp, product.currency ?? undefined)}
                    </span>
                  )}
                </div>
                {reason?.trim() && (
                  <p className="text-[12.5px] leading-snug text-ink-soft">{reason}</p>
                )}
              </div>

              <ChevronRight
                className="mt-6 h-5 w-5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onClose}
        disabled={!!busyProductId}
        className="mt-4 w-full py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
      >
        Browse all styles instead
      </button>
    </Sheet>
  );
}
