"use client";

import { forwardRef } from "react";
import { cn } from "./cn";

type Variant = "surface" | "ghost" | "glass";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required for icon-only controls. */
  label: string;
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  surface:
    "bg-surface border border-line text-ink-soft hover:text-ink hover:bg-surface-sunken shadow-[var(--shadow-card)]",
  ghost: "text-ink-soft hover:text-ink hover:bg-surface-sunken",
  glass:
    "bg-black/35 text-white backdrop-blur-md hover:bg-black/50 border border-white/15",
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, variant = "surface", className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed",
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

export default IconButton;
