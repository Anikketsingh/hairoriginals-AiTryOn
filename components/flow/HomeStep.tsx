"use client";

import Link from "next/link";
import { Camera, Wand2, Sparkles, ArrowRight, Images } from "lucide-react";
import Button from "@/components/ui/Button";

interface HomeStepProps {
  onStart: () => void;
}

const HOW_IT_WORKS = [
  { icon: Camera, label: "Add your photo" },
  { icon: Sparkles, label: "Pick a style" },
  { icon: Wand2, label: "See your look" },
];

export default function HomeStep({ onStart }: HomeStepProps) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pt-20 pb-28 animate-fade-in">
      {/* Hero visual */}
      <div className="relative mt-2 flex flex-1 flex-col items-center justify-center text-center">
        <div className="relative mb-8">
          <div className="absolute -inset-6 -z-10 rounded-full bg-gradient-to-br from-grad-1/30 via-grad-2/20 to-grad-3/30 blur-2xl" />
          <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br from-grad-1 via-grad-2 to-grad-3 text-white shadow-[var(--shadow-brand)]">
            <Wand2 className="h-12 w-12" strokeWidth={2.2} />
          </div>
        </div>

        <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight text-ink">
          Try any hairstyle
          <br />
          on <span className="bg-gradient-to-r from-grad-2 to-grad-3 bg-clip-text text-transparent">your own photo</span>
        </h1>
        <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-ink-soft">
          Snap a selfie, pick a look, and see it on you in seconds.
        </p>

        {/* How it works strip */}
        <div className="mt-9 flex items-center gap-2">
          {HOW_IT_WORKS.map(({ icon: Icon, label }, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface border border-line text-brand shadow-[var(--shadow-card)]">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[11px] font-semibold text-ink-soft">{label}</span>
              </div>
              {i < HOW_IT_WORKS.length - 1 && (
                <ArrowRight className="mb-5 h-4 w-4 shrink-0 text-line-strong" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Primary CTA pinned near the bottom (thumb zone) */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button size="lg" fullWidth onClick={onStart} rightIcon={<ArrowRight className="h-5 w-5" />}>
          Try a hairstyle
        </Button>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink transition-colors"
        >
          <Images className="h-4 w-4" /> My looks
        </Link>
      </div>
    </div>
  );
}
