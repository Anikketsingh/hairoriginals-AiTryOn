"use client";

/**
 * Shared building blocks for the standee screens. Sized for a 1080×1920
 * portrait touchscreen viewed from ~1m: tap targets are ≥ 96px tall and body
 * text starts around 28px, roughly 2.5× the phone UI.
 */

import { cn } from "@/components/ui/cn";

/** Frosted-glass pill — reads well over video and live camera. */
export function GlassButton({
  children,
  onClick,
  disabled,
  className,
  size = "lg",
  as = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  size?: "md" | "lg" | "xl";
  /** "span" when it only decorates a larger tap target (a button can't nest in a button). */
  as?: "button" | "span";
}) {
  const Tag = as;
  return (
    <Tag
      {...(as === "button" ? { type: "button" as const, onClick, disabled } : { "aria-hidden": true })}
      className={cn(
        "relative inline-flex items-center justify-center gap-4 rounded-full font-semibold text-white",
        "border border-white/35 bg-white/15 backdrop-blur-2xl",
        "shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.45)]",
        "transition-transform duration-150 active:scale-[0.97] disabled:opacity-40",
        size === "xl" && "min-h-[150px] px-20 text-[46px]",
        size === "lg" && "min-h-[112px] px-14 text-[34px]",
        size === "md" && "min-h-[92px] px-10 text-[28px]",
        as === "span" && disabled && "opacity-40",
        className
      )}
    >
      {children}
    </Tag>
  );
}

/** The main call to action on light screens — the web app's brand gradient, scaled up. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-[112px] items-center justify-center gap-4 rounded-full px-14 text-[34px] font-bold text-white",
        "bg-gradient-to-r from-grad-1 via-grad-2 to-grad-3 shadow-[var(--shadow-brand)]",
        "transition-transform duration-150 active:scale-[0.97] disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-[112px] items-center justify-center gap-4 rounded-full border-2 border-line-strong bg-surface px-12 text-[32px] font-semibold text-ink",
        "shadow-[var(--shadow-card)] transition-transform duration-150 active:scale-[0.97] disabled:opacity-40",
        className
      )}
    >
      {children}
    </button>
  );
}

export function KioskLogo({ className, light }: { className?: string; light?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-wordmark.png"
      alt="HairOriginals"
      draggable={false}
      className={cn("h-14 w-auto", light && "brightness-0 invert", className)}
    />
  );
}

/** Full-screen message for device states (booting, offline, unregistered, daily cap). */
export function StatusScreen({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 bg-canvas px-16 text-center">
      <KioskLogo className="h-16" />
      <h1 className="text-[56px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
      {body && <p className="max-w-[820px] text-[30px] leading-snug text-ink-soft">{body}</p>}
      {children}
    </div>
  );
}
