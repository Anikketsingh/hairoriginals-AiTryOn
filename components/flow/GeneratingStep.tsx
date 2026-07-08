"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

interface GeneratingStepProps {
  personImage?: string;
  productImage?: string;
  mimeType?: string;
  onCancel?: () => void;
}

const MESSAGES = [
  "Getting your photo ready…",
  "Studying your face and hairline…",
  "Placing the new style…",
  "Blending it in naturally…",
  "Adding the finishing touches…",
];

// Typical end-to-end time; the ring fills over this window and then holds at
// "almost there" rather than pretending to finish.
const ETA_SECONDS = 15;

export default function GeneratingStep({ personImage, productImage, onCancel }: GeneratingStepProps) {
  const [i, setI] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const msg = setInterval(() => setI((p) => (p + 1) % MESSAGES.length), 2800);
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      clearInterval(msg);
      clearInterval(tick);
    };
  }, []);

  const remaining = Math.max(0, ETA_SECONDS - elapsed);
  const pct = Math.min(100, Math.round((elapsed / ETA_SECONDS) * 100));
  // SVG progress ring geometry
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Creating your look, please wait"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-canvas px-6 animate-fade-in"
    >
      {/* Input previews with animated progress ring */}
      <div className="relative flex items-center">
        <div className="absolute -inset-5 -z-10 animate-pulse rounded-full bg-gradient-to-br from-grad-1/25 via-grad-2/20 to-grad-3/25 blur-2xl" />
        {personImage && (
          <div className="h-28 w-24 -rotate-6 overflow-hidden rounded-2xl border-2 border-surface bg-surface-sunken shadow-[var(--shadow-pop)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={personImage} alt="Your photo" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="relative z-10 -mx-3 flex h-16 w-16 items-center justify-center">
          {/* Progress ring around the spark */}
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-line-strong, #e5e7eb)" strokeWidth="6" opacity="0.4" />
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke="url(#genGrad)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C - (pct / 100) * C}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
            <defs>
              <linearGradient id="genGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--color-grad-1, #a855f7)" />
                <stop offset="100%" stopColor="var(--color-grad-3, #ec4899)" />
              </linearGradient>
            </defs>
          </svg>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-grad-1 via-grad-2 to-grad-3 text-white shadow-[var(--shadow-brand)]">
            <Sparkles className="h-5 w-5 animate-pulse" aria-hidden="true" />
          </span>
        </div>
        {productImage && (
          <div className="h-28 w-24 rotate-6 overflow-hidden rounded-2xl border-2 border-surface bg-surface-sunken shadow-[var(--shadow-pop)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={productImage} alt="Chosen style" className="h-full w-full object-cover" />
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Creating your look</h2>
        <p className="min-h-[1.5rem] text-[15px] font-medium text-ink-soft transition-opacity duration-300">
          {MESSAGES[i]}
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {remaining > 0 ? `About ${remaining}s remaining` : "Almost there — hang tight"}
        </p>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5" aria-hidden="true">
        {MESSAGES.map((_, idx) => (
          <span
            key={idx}
            className={[
              "h-1.5 rounded-full transition-all duration-300",
              idx === i ? "w-5 bg-brand" : "w-1.5 bg-line-strong",
            ].join(" ")}
          />
        ))}
      </div>

      {/* Cancel */}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink-soft shadow-[var(--shadow-card)] transition-colors hover:text-ink active:scale-95 focus-visible:outline-2 focus-visible:outline-brand"
        >
          <X className="h-4 w-4" aria-hidden="true" /> Cancel
        </button>
      )}
    </div>
  );
}