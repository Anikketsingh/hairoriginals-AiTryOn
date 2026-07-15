"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Images, Sparkles } from "lucide-react";
import { cn } from "@/components/ui/cn";

const TABS = [
  { href: "/", label: "Try On", icon: Home },
  { href: "/dashboard", label: "My Looks", icon: Images },
];

interface BottomNavProps {
  /** Center FAB action. Without it the FAB links home to start a try-on. */
  onCta?: () => void;
}

/**
 * Persistent bottom tab bar for non-flow screens (home, dashboard):
 * a rounded white bar with a raised gradient FAB in the middle. The
 * canvas-colored ring around the FAB fakes the notch cut-out.
 */
export default function BottomNav({ onCta }: BottomNavProps) {
  const pathname = usePathname();

  const fabInner = (
    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-grad-1 via-grad-2 to-grad-3 text-white shadow-[var(--shadow-brand)] ring-[6px] ring-canvas transition active:scale-95">
      <Sparkles className="h-7 w-7" fill="currentColor" strokeWidth={1} />
    </span>
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
      <div className="relative mx-auto max-w-md">
        <div className="absolute -top-7 left-1/2 z-10 -translate-x-1/2">
          {onCta ? (
            <button type="button" onClick={onCta} aria-label="Start a try-on">
              {fabInner}
            </button>
          ) : (
            <Link href="/" aria-label="Start a try-on">
              {fabInner}
            </Link>
          )}
        </div>

        <div className="rounded-t-[1.75rem] border-t border-line bg-surface/95 shadow-[0_-8px_28px_rgba(26,22,19,0.08)] backdrop-blur-md pb-safe">
          <div className="grid grid-cols-[1fr_5.5rem_1fr]">
            {TABS.map(({ href, label, icon: Icon }, i) => {
              const active = pathname === href;
              return (
                <Fragment key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "flex flex-col items-center gap-1 pb-2.5 pt-3 text-[11px] font-semibold transition-colors",
                      active ? "text-brand" : "text-ink-faint hover:text-ink-soft"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                    {label}
                  </Link>
                  {i === 0 && <div aria-hidden="true" />}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
