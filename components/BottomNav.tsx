"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Images } from "lucide-react";
import { cn } from "@/components/ui/cn";

const TABS = [
  { href: "/", label: "Try On", icon: Home },
  { href: "/dashboard", label: "My Looks", icon: Images },
];

/**
 * Persistent bottom tab bar for non-flow screens (home, dashboard).
 * Thumb-reachable, safe-area padded.
 */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 backdrop-blur-md pb-safe">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
                active ? "text-brand" : "text-ink-faint hover:text-ink-soft"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
