"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui/cn";

interface StickyActionBarProps {
  children: React.ReactNode;
  /** Extra classes for the outer fixed shell. */
  className?: string;
  /**
   * Sit the bar *above* the persistent BottomNav (home screen) instead of
   * flush to the bottom edge. The nav owns the safe-area padding in that case.
   */
  raised?: boolean;
}

/**
 * A bottom action bar that is genuinely pinned to the viewport.
 *
 * It portals to document.body so it escapes any transformed ancestor. This
 * matters because the flow steps' root containers keep a lingering
 * `transform: translateY(0)` from `.animate-fade-in` (forwards fill), which
 * would otherwise become the containing block for a `position: fixed` child
 * and anchor the bar to the bottom of the (tall) page instead of the screen.
 *
 * The shell mirrors the existing bar pattern (BottomNav, and the old inline
 * CTAs it replaces): translucent canvas + blur, top border, safe-area padded.
 */
export default function StickyActionBar({ children, className, raised = false }: StickyActionBarProps) {
  // Portal targets document.body, which only exists on the client — render
  // nothing until mounted so server and first client render match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-x-0 z-30 border-t border-line bg-canvas/90 px-5 pt-3 backdrop-blur-md",
        raised
          ? "bottom-[calc(3.75rem+env(safe-area-inset-bottom))]"
          : "bottom-0 pb-safe",
        className
      )}
    >
      {children}
    </div>,
    document.body
  );
}
