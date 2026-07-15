"use client";

import { ArrowLeft, Check } from "lucide-react";
import { cn } from "./cn";

interface FlowStepperProps {
  /** 1-based index of the current step. */
  current: number;
  steps: string[];
  onBack: () => void;
}

/**
 * Inline back-button + labeled step chips, placed at the top of each flow
 * screen's content (rather than in the persistent header).
 */
export default function FlowStepper({ current, steps, onBack }: FlowStepperProps) {
  return (
    <div className="flex items-center gap-2.5" aria-label={`Step ${current} of ${steps.length}`}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Go back"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition hover:bg-surface-sunken active:scale-90"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      {steps.map((label, i) => {
        const index = i + 1;
        const done = index < current;
        const active = index === current;
        return (
          <div key={label} className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-extrabold transition-colors duration-300",
                  done ? "bg-brand text-white" : active ? "bg-brand text-white" : "border border-line-strong bg-surface text-ink-faint"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index}
              </span>
              <span className={cn("text-[12.5px] font-semibold transition-colors", active || done ? "text-ink" : "text-ink-faint")}>
                {label}
              </span>
            </div>
            {index < steps.length && <span className="h-0.5 w-[18px] rounded-full bg-line" />}
          </div>
        );
      })}
    </div>
  );
}
