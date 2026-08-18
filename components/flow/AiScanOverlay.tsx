"use client";

import { useEffect, useState } from "react";
import { ScanFace, X } from "lucide-react";

interface AiScanOverlayProps {
  /** The customer's own photo — scanning *their* face is what sells the effect. */
  personImage?: string;
  onCancel?: () => void;
}

const MESSAGES = [
  "Detecting your face…",
  "Reading your face shape…",
  "Checking your hairline…",
  "Assessing hair texture and density…",
  "Matching against your best styles…",
];

const MESSAGE_INTERVAL_MS = 2200;
// Brackets snap on shortly after the first sweep starts, so the scan reads as
// "found you" rather than "still looking".
const LOCK_ON_DELAY_MS = 900;

export default function AiScanOverlay({ personImage, onCancel }: AiScanOverlayProps) {
  const [i, setI] = useState(0);
  const [lockedOn, setLockedOn] = useState(false);

  useEffect(() => {
    const msg = setInterval(() => setI((p) => (p + 1) % MESSAGES.length), MESSAGE_INTERVAL_MS);
    const lock = setTimeout(() => setLockedOn(true), LOCK_ON_DELAY_MS);
    return () => {
      clearInterval(msg);
      clearTimeout(lock);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Scanning your photo to find styles that suit you"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-canvas px-6 animate-fade-in"
    >
      {/* Photo + scan effects */}
      <div className="relative">
        <div className="absolute -inset-6 -z-10 animate-pulse rounded-full bg-gradient-to-br from-grad-1/25 via-grad-2/20 to-grad-3/25 blur-2xl" />

        <div className="relative h-72 w-56 overflow-hidden rounded-[var(--radius-xl)] border-2 border-surface bg-surface-sunken shadow-[var(--shadow-pop)]">
          {personImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={personImage}
              alt="Your photo"
              className="h-full w-full object-cover saturate-[0.85]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ScanFace className="h-12 w-12 text-line-strong" aria-hidden="true" />
            </div>
          )}

          {/* Dot mesh */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full animate-mesh-in"
            aria-hidden="true"
          >
            <defs>
              <pattern id="scanMesh" width="14" height="14" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="var(--color-brand, #b9595c)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#scanMesh)" />
          </svg>

          {/* Sweeping scan line + its glow trail */}
          <div className="pointer-events-none absolute inset-x-0 top-0 animate-scan-sweep" aria-hidden="true">
            <div className="h-16 bg-gradient-to-b from-transparent to-brand/25" />
            <div className="h-0.5 bg-gradient-to-r from-transparent via-brand to-transparent shadow-[0_0_12px_var(--color-brand)]" />
          </div>

          {/* Lock-on brackets */}
          {lockedOn && (
            <div className="pointer-events-none absolute inset-8 animate-scale-in" aria-hidden="true">
              {[
                "left-0 top-0 border-l-2 border-t-2 rounded-tl-lg",
                "right-0 top-0 border-r-2 border-t-2 rounded-tr-lg",
                "left-0 bottom-0 border-l-2 border-b-2 rounded-bl-lg",
                "right-0 bottom-0 border-r-2 border-b-2 rounded-br-lg",
              ].map((pos) => (
                <span key={pos} className={`absolute h-7 w-7 border-brand ${pos}`} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Analysing your look</h2>
        <p className="min-h-[1.5rem] text-[15px] font-medium text-ink-soft transition-opacity duration-300">
          {MESSAGES[i]}
        </p>
      </div>

      {/* Progress dots — same treatment as GeneratingStep, so the two
          full-screen takeovers read as one system. */}
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
