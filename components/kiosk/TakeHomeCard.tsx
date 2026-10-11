"use client";

/**
 * The result screen's "take it home" call to action — the standee's main
 * lead-capture moment. Deliberately the loudest thing on the screen: brand
 * gradient, a soft pulse, and the offer spelled out.
 */

import { ChevronRight, Download, Home, Smartphone } from "lucide-react";

export default function TakeHomeCard({
  discountPercent,
  done,
  onClick,
}: {
  discountPercent: number;
  /** The visitor already gave their number — show a calm confirmation instead. */
  done: boolean;
  onClick: () => void;
}) {
  if (done) {
    return (
      <div className="flex w-full items-center gap-6 rounded-[48px] border-2 border-success/30 bg-success-soft px-10 py-8 text-success">
        <Smartphone className="h-14 w-14 shrink-0" />
        <p className="text-[30px] font-bold leading-tight">Sent to your phone — check your messages ✓</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-[48px] bg-gradient-to-r from-grad-1 via-grad-2 to-grad-3 px-10 py-9 text-left text-white shadow-[0_20px_60px_rgba(185,89,92,0.45)] transition-transform active:scale-[0.98]"
    >
      <span className="pointer-events-none absolute inset-0 animate-pulse bg-white/10 [animation-duration:2.6s]" />
      <span className="relative flex items-center gap-8">
        <span className="flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30">
          <Smartphone className="h-14 w-14" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[42px] font-extrabold leading-tight">Send my looks to my phone</span>
          <span className="mt-3 flex flex-wrap items-center gap-3 text-[24px] font-semibold">
            <span className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5">
              <Download className="h-6 w-6" /> Free HD photos
            </span>
            {discountPercent > 0 && (
              <span className="flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-brand">
                <Home className="h-6 w-6" /> {discountPercent}% off home trial
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="h-14 w-14 shrink-0 transition-transform group-active:translate-x-1" />
      </span>
    </button>
  );
}
