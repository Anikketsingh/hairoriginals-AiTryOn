"use client";

/**
 * "Creating your look" — the web GeneratingStep (photo + style cards around
 * a progress ring, rotating status lines) at standee scale.
 */

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { KioskLogo } from "@/components/kiosk/ui";

const MESSAGES = [
  "Getting your photo ready…",
  "Studying your face and hairline…",
  "Placing your new style…",
  "Blending it in naturally…",
  "Adding the finishing touches…",
];
const ETA_SECONDS = 15;
const R = 46;
const C = 2 * Math.PI * R;

export default function GeneratingScreen({ photoUrl, styleUrl }: { photoUrl?: string; styleUrl?: string }) {
  const [msg, setMsg] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const m = setInterval(() => setMsg((i) => (i + 1) % MESSAGES.length), 2800);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      clearInterval(m);
      clearInterval(t);
    };
  }, []);

  const pct = Math.min(100, Math.round((elapsed / ETA_SECONDS) * 100));

  return (
    <div role="status" aria-live="polite" className="flex h-full flex-col items-center justify-center gap-16 bg-canvas px-12">
      <KioskLogo className="absolute top-[4vh] h-12" />

      <div className="relative flex items-center">
        <div className="absolute -inset-16 -z-10 animate-pulse rounded-full bg-gradient-to-br from-grad-1/25 via-grad-2/20 to-grad-3/25 blur-3xl" />
        {photoUrl && <Card src={photoUrl} alt="Your photo" className="-rotate-6" />}
        <div className="relative z-10 -mx-10 flex h-[180px] w-[180px] items-center justify-center">
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-line-strong)" strokeWidth="5" opacity="0.5" />
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke="url(#kioskGenGrad)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C - (pct / 100) * C}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
            <defs>
              <linearGradient id="kioskGenGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--color-grad-1)" />
                <stop offset="100%" stopColor="var(--color-grad-3)" />
              </linearGradient>
            </defs>
          </svg>
          <span className="flex h-[124px] w-[124px] items-center justify-center rounded-full bg-gradient-to-br from-grad-1 via-grad-2 to-grad-3 text-white shadow-[var(--shadow-brand)]">
            <Sparkles className="h-14 w-14 animate-pulse" />
          </span>
        </div>
        {styleUrl && <Card src={styleUrl} alt="Chosen style" className="rotate-6" />}
      </div>

      <div className="flex flex-col items-center gap-5 text-center">
        <h2 className="text-[60px] font-extrabold tracking-tight text-ink">Creating your look</h2>
        <p className="min-h-[44px] text-[34px] font-medium text-ink-soft">{MESSAGES[msg]}</p>
        <p className="text-[26px] text-ink-faint">
          {elapsed < ETA_SECONDS ? `About ${ETA_SECONDS - elapsed}s remaining` : "Almost there — hang tight"}
        </p>
      </div>

      <div className="flex gap-3" aria-hidden="true">
        {MESSAGES.map((_, i) => (
          <span
            key={i}
            className={`h-3 rounded-full transition-all duration-300 ${i === msg ? "w-12 bg-brand" : "w-3 bg-line-strong"}`}
          />
        ))}
      </div>
    </div>
  );
}

function Card({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`h-[400px] w-[300px] overflow-hidden rounded-[40px] border-[6px] border-surface bg-surface-sunken shadow-[var(--shadow-pop)] ${className ?? ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" />
    </div>
  );
}
