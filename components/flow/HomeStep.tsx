"use client";

import { Fragment } from "react";
import {
  Camera,
  Sparkles,
  Smile,
  ArrowRight,
  ShieldCheck,
  Zap,
  Heart,
  ChevronRight,
} from "lucide-react";
import Button from "@/components/ui/Button";
import HeroBeforeAfter from "@/components/flow/HeroBeforeAfter";

interface HomeStepProps {
  onStart: () => void;
}

const HOW_IT_WORKS = [
  { icon: Camera, label: "Add your photo" },
  { icon: Sparkles, label: "Pick a style" },
  { icon: Smile, label: "See your look" },
];

const TRUST = [
  { icon: Zap, lines: ["Ready in", "seconds"], fill: true },
  { icon: ShieldCheck, lines: ["100%", "Private"], fill: false },
  { icon: Heart, lines: ["Loved by", "thousands"], fill: false },
];

/** Hand-drawn double underline under the headline accent. */
function Squiggle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 12"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M2 6.5C32 3 78 3 118 5.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M30 10.5c16-1.6 30-1.6 44-.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Little emphasis dashes flanking the "How it works" title. */
function TitleSpark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 22" fill="none" aria-hidden="true" className={className}>
      <path d="M12.2 3 8.6 7.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M2.2 11h5.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12.2 19 8.6 14.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Home screen. Single centered column on mobile (matches the reference
 * design 1:1); on lg+ it becomes a two-column hero — copy, steps, and
 * trust on the left, the before/after card on the right.
 */
export default function HomeStep({ onStart }: HomeStepProps) {
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-[calc(env(safe-area-inset-top)+5rem)] pb-[calc(env(safe-area-inset-bottom)+7.5rem)] animate-fade-in lg:max-w-6xl lg:px-8 lg:pt-[calc(env(safe-area-inset-top)+6rem)] lg:pb-12">
      <div className="lg:grid lg:min-h-[calc(100dvh-13rem)] lg:grid-cols-2 lg:content-center lg:items-center lg:gap-x-16 xl:gap-x-24">
        {/* Headline + sub + desktop CTA */}
        <div className="lg:col-start-1 lg:row-start-1">
          <h1 className="text-center text-[2rem] font-extrabold leading-[1.16] tracking-tight text-ink lg:text-left lg:text-[3.4rem] lg:leading-[1.08]">
            Your perfect hair
            <br />
            is just a{" "}
            <span className="relative inline-block text-brand-strong">
              selfie away
              <Squiggle className="absolute -bottom-2.5 left-0 h-3 w-full text-brand-strong lg:-bottom-4 lg:h-4" />
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-[17rem] text-center text-[15px] leading-snug text-ink-soft lg:mx-0 lg:mt-6 lg:max-w-sm lg:text-left lg:text-lg lg:leading-relaxed">
            Try on any hairstyle in seconds with the power of AI&nbsp;✨
          </p>
          <div className="hidden lg:mt-9 lg:block">
            <Button
              size="lg"
              onClick={onStart}
              className="min-h-[3.5rem] rounded-full px-9"
              leftIcon={<Sparkles className="h-5 w-5" fill="currentColor" strokeWidth={1} />}
              rightIcon={<ChevronRight className="h-5 w-5" />}
            >
              Try a Hairstyle
            </Button>
          </div>
        </div>

        {/* Hero card: before/after slider (+ CTA on mobile) */}
        <div className="mt-6 rounded-[2rem] bg-surface p-3 shadow-[var(--shadow-card)] lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-0 lg:w-full lg:max-w-[27rem] lg:justify-self-end lg:p-3.5">
          <HeroBeforeAfter beforeSrc="/before.png" afterSrc="/after.png" />
          <Button
            size="lg"
            fullWidth
            onClick={onStart}
            className="mt-3 min-h-[3.5rem] rounded-full lg:hidden"
            leftIcon={<Sparkles className="h-5 w-5" fill="currentColor" strokeWidth={1} />}
            rightIcon={
              <ChevronRight className="absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2" />
            }
          >
            Try a Hairstyle
          </Button>
        </div>

        {/* How it works */}
        <div className="lg:col-start-1 lg:row-start-2">
          <div className="mt-9 flex items-center justify-center gap-2.5 lg:mt-12 lg:justify-start">
            <TitleSpark className="h-5 w-auto text-brand" />
            <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink lg:text-2xl">
              How it works
            </h2>
            <TitleSpark className="h-5 w-auto -scale-x-100 text-brand" />
          </div>

          <div className="mt-5 flex items-start justify-center lg:justify-start">
            {HOW_IT_WORKS.map(({ icon: Icon, label }, i) => (
              <Fragment key={label}>
                <div className="flex w-[5.75rem] flex-col items-center gap-2.5 lg:w-[7.75rem]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-brand shadow-[var(--shadow-card)]">
                    <Icon className="h-7 w-7" strokeWidth={1.8} />
                  </div>
                  <span className="text-center text-xs font-semibold leading-snug text-ink lg:text-[13px]">
                    {i + 1}. {label}
                  </span>
                </div>
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="flex h-16 items-center">
                    <ArrowRight className="h-4 w-4 shrink-0 text-brand/35" />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Trust bar */}
        <div className="mt-8 grid grid-cols-3 divide-x divide-brand/15 rounded-[1.5rem] bg-brand-soft/80 py-4 lg:col-start-1 lg:row-start-3 lg:mt-10 lg:max-w-lg">
          {TRUST.map(({ icon: Icon, lines, fill }) => (
            <div key={lines.join(" ")} className="flex items-center justify-center gap-2 px-1">
              <Icon
                className="h-5 w-5 shrink-0 text-brand"
                fill={fill ? "currentColor" : "none"}
                strokeWidth={fill ? 1 : 2}
              />
              <span className="text-xs font-semibold leading-tight text-ink">
                {lines[0]}
                <br />
                {lines[1]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
