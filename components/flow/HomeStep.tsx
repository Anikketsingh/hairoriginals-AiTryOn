"use client";

import { Camera, Wand2, Sparkles, ArrowRight, ShieldCheck, Zap, Gift } from "lucide-react";
import Button from "@/components/ui/Button";
import StickyActionBar from "@/components/ui/StickyActionBar";
import Logo from "@/components/ui/Logo";

interface HomeStepProps {
  onStart: () => void;
}

const HOW_IT_WORKS = [
  { icon: Camera, label: "Add your photo" },
  { icon: Sparkles, label: "Pick a style" },
  { icon: Wand2, label: "See your look" },
];

const TRUST = [
  { icon: Gift, label: "Free to try" },
  { icon: ShieldCheck, label: "Photos stay private" },
  { icon: Zap, label: "Ready in seconds" },
];

export default function HomeStep({ onStart }: HomeStepProps) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pt-20 pb-44 animate-fade-in">
      {/* Hero visual */}
      <div className="relative mt-2 flex flex-1 flex-col items-center justify-center text-center">
        <Logo className="mb-8 h-10 w-auto" />
        <div className="relative mb-8">
          <div className="absolute -inset-6 -z-10 rounded-full bg-gradient-to-br from-grad-1/30 via-grad-2/20 to-grad-3/30 blur-2xl" />
          <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br from-grad-1 via-grad-2 to-grad-3 text-white shadow-[var(--shadow-brand)]">
            <Wand2 className="h-12 w-12" strokeWidth={2.2} />
          </div>
        </div>

        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink sm:text-[2rem]">
          Try any hairstyle
          <br />
          on <span className="bg-gradient-to-r from-grad-2 to-grad-3 bg-clip-text text-transparent">your own photo</span>
        </h1>
        <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-ink-soft text-balance">
          Snap a selfie, pick a look, and see it on you in seconds.
        </p>

        {/* How it works strip */}
        <div className="mt-9 flex w-full items-center justify-center gap-1.5">
          {HOW_IT_WORKS.map(({ icon: Icon, label }, i) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="flex w-[4.75rem] flex-col items-center gap-1.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface border border-line text-brand shadow-[var(--shadow-card)]">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-center text-[11px] font-semibold leading-tight text-ink-soft">{label}</span>
              </div>
              {i < HOW_IT_WORKS.length - 1 && (
                <ArrowRight className="mb-5 h-4 w-4 shrink-0 text-line-strong" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Trust strip — honest, feature-based reassurance */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        {TRUST.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 shadow-[var(--shadow-card)]"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
            <span className="whitespace-nowrap text-[11px] font-semibold text-ink-soft">{label}</span>
          </div>
        ))}
      </div>

      {/* Primary CTA — pinned in the thumb zone, above the BottomNav.
          "My looks" is reachable from the BottomNav tab, so it's not repeated
          here. */}
      <StickyActionBar raised>
        <div className="mx-auto max-w-md pb-3">
          <Button size="lg" fullWidth onClick={onStart} rightIcon={<ArrowRight className="h-5 w-5" />}>
            Try a hairstyle
          </Button>
        </div>
      </StickyActionBar>
    </div>
  );
}
