import { Check } from "lucide-react";
import { cn } from "./cn";

interface StepperProps {
  /** 1-based index of the current step. */
  current: number;
  steps: string[];
}

/**
 * Compact progress indicator for the guided flow.
 * Renders as connected dots; the active dot is labelled.
 */
export default function Stepper({ current, steps }: StepperProps) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${steps.length}`}>
      {steps.map((label, i) => {
        const index = i + 1;
        const done = index < current;
        const active = index === current;
        return (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-6 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300",
                active
                  ? "gap-1 bg-brand px-2.5 text-white"
                  : done
                  ? "w-6 bg-brand/15 text-brand"
                  : "w-6 bg-surface-sunken text-ink-faint"
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : index}
              {active && <span className="text-[11px] font-semibold">{label}</span>}
            </span>
            {index < steps.length && (
              <span
                className={cn(
                  "h-0.5 w-3 rounded-full transition-colors duration-300",
                  done ? "bg-brand/40" : "bg-line"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
