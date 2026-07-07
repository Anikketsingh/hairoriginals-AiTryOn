"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Hide the default header (title + close). */
  hideHeader?: boolean;
  /** Center as a dialog on desktop; always bottom-sheet on mobile. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Mobile-first bottom sheet (centers as a dialog on ≥sm screens).
 * Standardizes modal chrome: single backdrop, Escape-to-close,
 * focus trap, scroll lock, and safe-area padding.
 */
export default function Sheet({
  open,
  onClose,
  title,
  hideHeader = false,
  className,
  children,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    // Move focus into the sheet
    const t = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])'
      );
      (focusable ?? panelRef.current)?.focus();
    }, 20);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-overlay-in"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-lg bg-surface shadow-[var(--shadow-pop)] outline-none",
          "rounded-t-[var(--radius-2xl)] sm:rounded-[var(--radius-xl)]",
          "max-h-[92dvh] overflow-y-auto pb-safe animate-slide-up sm:animate-scale-in",
          className
        )}
      >
        {/* Drag handle (mobile) */}
        <div className="sticky top-0 z-10 flex justify-center bg-surface pt-3 sm:hidden">
          <span className="h-1.5 w-10 rounded-full bg-line-strong" />
        </div>

        {!hideHeader && (
          <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-2 sm:pt-5">
            {title ? (
              <h2 className="text-lg font-bold text-ink">{title}</h2>
            ) : (
              <span />
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-surface-sunken active:scale-90 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="px-5 pb-6 sm:pb-7">{children}</div>
      </div>
    </div>,
    document.body
  );
}
