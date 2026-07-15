"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Stepper from "@/components/ui/Stepper";
import Logo from "@/components/ui/Logo";

interface TopBarProps {
  /** Show a back arrow and wire it up. */
  onBack?: () => void;
  /** 1-based current step for the flow progress indicator. Omit to hide. */
  step?: number;
  title?: string;
  /** Home-screen chrome: centered wordmark. Scrolls away with the page on
   *  mobile; stays pinned on lg+. */
  home?: boolean;
}

const FLOW_STEPS = ["Photo", "Style", "Result"];

export default function TopBar({ onBack, step, title, home }: TopBarProps) {
  if (home) {
    return (
      <header className="absolute inset-x-0 top-0 z-40 bg-canvas/85 backdrop-blur-md pt-safe lg:fixed">
        <div className="mx-auto flex h-14 max-w-md items-center justify-center px-5 lg:max-w-6xl lg:px-8">
          <Link href="/" aria-label="HairOriginals home" className="flex items-center">
            <Logo className="h-11 w-auto lg:h-12" />
          </Link>
        </div>
      </header>
    );
  }

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
            <Link href="/" className="flex items-center" aria-label="HairOriginals home">
              <Logo className="h-7 w-auto" />
            </Link>
          )}
          {title && <span className="truncate text-sm font-semibold text-ink">{title}</span>}
        </div>

        {step ? <Stepper current={step} steps={FLOW_STEPS} /> : null}
      </div>
    </header>
  );
}
