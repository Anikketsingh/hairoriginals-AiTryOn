import { cn } from "./cn";

type Tone = "brand" | "neutral" | "success" | "warn" | "danger" | "dark";

const tones: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-ink",
  neutral: "bg-surface-sunken text-ink-soft",
  success: "bg-success-soft text-success",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  dark: "bg-ink/85 text-white backdrop-blur-sm",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export default function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
