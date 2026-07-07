"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

type Variant = "primary" | "solid" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const base =
  "relative inline-flex items-center justify-center gap-2 font-semibold select-none transition-all duration-200 disabled:cursor-not-allowed active:scale-[0.97] focus-visible:outline-2";

const sizes: Record<Size, string> = {
  // All meet the 44px min touch target
  sm: "min-h-11 px-4 text-sm rounded-[var(--radius-sm)]",
  md: "min-h-12 px-5 text-[15px] rounded-[var(--radius-md)]",
  lg: "min-h-14 px-6 text-base rounded-[var(--radius-lg)]",
};

const variants: Record<Variant, string> = {
  primary:
    "text-white bg-gradient-to-r from-grad-1 via-grad-2 to-grad-3 shadow-[var(--shadow-brand)] hover:brightness-105 disabled:opacity-40 disabled:shadow-none disabled:from-line-strong disabled:via-line-strong disabled:to-line-strong",
  solid:
    "text-white bg-brand hover:bg-brand-strong disabled:opacity-40",
  secondary:
    "text-ink bg-surface border border-line-strong hover:bg-surface-sunken disabled:opacity-40",
  ghost:
    "text-ink-soft bg-transparent hover:bg-surface-sunken disabled:opacity-40",
  danger:
    "text-white bg-danger hover:brightness-95 disabled:opacity-40",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    className,
    children,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        base,
        sizes[size],
        variants[variant],
        fullWidth && "w-full",
        variant === "primary" && "overflow-hidden group",
        className
      )}
      {...props}
    >
      {/* Shimmer sweep on the hero variant */}
      {variant === "primary" && !disabled && !loading && (
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
      )}
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        leftIcon
      )}
      {children && <span className="relative">{children}</span>}
      {!loading && rightIcon}
    </button>
  );
});

export default Button;
