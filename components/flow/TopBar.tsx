"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Images, Info, Menu, Sparkles } from "lucide-react";
import Stepper from "@/components/ui/Stepper";
import Logo from "@/components/ui/Logo";
import Sheet from "@/components/ui/Sheet";

interface TopBarProps {
  /** Show a back arrow and wire it up. */
  onBack?: () => void;
  /** 1-based current step for the flow progress indicator. Omit to hide. */
  step?: number;
  /** Right-side slot (e.g. a "My looks" link). */
  right?: React.ReactNode;
  title?: string;
  /** Home-screen chrome: menu button left, wordmark centered, `right` at right. */
  home?: boolean;
}

const FLOW_STEPS = ["Photo", "Style", "Result"];

const MENU_ITEMS = [
  { href: "/", label: "Try a hairstyle", sub: "Start a new AI try-on", icon: Sparkles },
  { href: "/dashboard", label: "My Looks", sub: "Your saved styles & history", icon: Images },
  { href: "/about", label: "About", sub: "Who made this app", icon: Info },
];

export default function TopBar({ onBack, step, right, title, home }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (home) {
    return (
      <>
        <header className="fixed inset-x-0 top-0 z-40 bg-canvas/85 backdrop-blur-md pt-safe">
          <div className="relative mx-auto flex h-14 max-w-3xl items-center justify-between px-3 lg:max-w-6xl lg:px-5">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-sunken active:scale-90 transition"
            >
              <Menu className="h-6 w-6" strokeWidth={2.2} />
            </button>
            <Link
              href="/"
              aria-label="HairOriginals home"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <Logo className="h-9 w-auto" />
            </Link>
            {right}
          </div>
        </header>

        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
          <nav className="space-y-1">
            {MENU_ITEMS.map(({ href, label, sub, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3.5 rounded-2xl px-3 py-3 transition hover:bg-surface-sunken"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{label}</span>
                  <span className="block text-xs text-ink-faint">{sub}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
              </Link>
            ))}
          </nav>
        </Sheet>
      </>
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

        {step ? (
          <Stepper current={step} steps={FLOW_STEPS} />
        ) : (
          right ?? null
        )}
      </div>
    </header>
  );
}
