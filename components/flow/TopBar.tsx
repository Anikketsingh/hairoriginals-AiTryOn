"use client";

import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import Stepper from "@/components/ui/Stepper";

interface TopBarProps {
  /** Show a back arrow and wire it up. */
  onBack?: () => void;
  /** 1-based current step for the flow progress indicator. Omit to hide. */
  step?: number;
  /** Right-side slot (e.g. a "My looks" link). */
  right?: React.ReactNode;
  title?: string;
}

const FLOW_STEPS = ["Photo", "Style", "Result"];

export default function TopBar({ onBack, step, right, title }: TopBarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur-md pt-safe">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Go back"
              className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-surface-sunken active:scale-90 transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <Link href="/" className="flex items-center gap-2" aria-label="HairOriginals home">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-grad-1 to-grad-3 text-white shadow-[var(--shadow-brand)]">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-extrabold tracking-tight text-ink">HairOriginals</span>
            </Link>
          )}
          {title && <span className="truncate text-sm font-semibold text-ink">{title}</span>}
        </div>

        {step ? (
          <Stepper current={step} steps={FLOW_STEPS} />
        ) : (
          right ?? null
        )}
      </div>
    </header>
  );
}
