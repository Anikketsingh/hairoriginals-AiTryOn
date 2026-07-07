"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

interface GeneratingStepProps {
  personImage?: string;
  productImage?: string;
  mimeType?: string;
}

const MESSAGES = [
  "Getting your photo ready…",
  "Studying your face and hairline…",
  "Placing the new style…",
  "Blending it in naturally…",
  "Adding the finishing touches…",
];

export default function GeneratingStep({ personImage, productImage }: GeneratingStepProps) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % MESSAGES.length), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Creating your look, please wait"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-canvas px-6 animate-fade-in"
    >
      {/* Input previews with animated ring */}
      <div className="relative flex items-center">
        <div className="absolute -inset-5 -z-10 animate-pulse rounded-full bg-gradient-to-br from-grad-1/25 via-grad-2/20 to-grad-3/25 blur-2xl" />
        {personImage && (
          <div className="h-28 w-24 -rotate-6 overflow-hidden rounded-2xl border-2 border-surface bg-surface-sunken shadow-[var(--shadow-pop)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={personImage} alt="Your photo" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="z-10 -mx-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-grad-1 via-grad-2 to-grad-3 text-white shadow-[var(--shadow-brand)]">
          <Sparkles className="h-6 w-6 animate-pulse" />
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
        <p className="mt-1 text-xs text-ink-faint">This usually takes about 15 seconds</p>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5">
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
    </div>
  );
}
