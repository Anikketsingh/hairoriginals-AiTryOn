"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Button, useToast } from "@/components/ui";
import type { Product } from "@/lib/types";

interface FeedbackSheetProps {
  open: boolean;
  onClose: () => void;
  sessionToken: string | null;
  generationId?: string | null;
  /** The look the customer just tried on — recorded alongside the feedback. */
  product?: Product | null;
  /** Called after a successful submit (so the caller can stop re-prompting). */
  onSubmitted: () => void;
}

type Interest = "yes" | "maybe" | "browsing";

const RATINGS: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: "😞", label: "Bad" },
  { value: 2, emoji: "😐", label: "Meh" },
  { value: 3, emoji: "🙂", label: "Good" },
  { value: 4, emoji: "😍", label: "Loved it" },
];

const INTEREST_OPTIONS: { value: Interest; label: string }[] = [
  { value: "yes", label: "Yes, tell me more" },
  { value: "maybe", label: "Maybe later" },
  { value: "browsing", label: "Just browsing" },
];

/**
 * Short, skippable post-trial feedback prompt. Shown once on the result screen
 * after a logged-in customer's first try-on (re-prompted once if skipped).
 */
export default function FeedbackSheet({
  open,
  onClose,
  sessionToken,
  generationId,
  product,
  onSubmitted,
}: FeedbackSheetProps) {
  const { toast } = useToast();
  const [rating, setRating] = useState<number | null>(null);
  const [improvement, setImprovement] = useState("");
  const [interest, setInterest] = useState<Interest | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === null || !sessionToken) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/customer/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          rating,
          improvement: improvement.trim() || undefined,
          interest: interest ?? undefined,
          generationId: generationId ?? undefined,
          productId: product?.id ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't send your feedback.");
      }
      onSubmitted();
      onClose();
      toast("Thanks for your feedback!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't send your feedback.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="How was your try-on?">
      <div className="flex flex-col gap-6">
        {/* 1. Experience rating (required) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            {RATINGS.map((r) => {
              const selected = rating === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  aria-label={r.label}
                  aria-pressed={selected}
                  onClick={() => setRating(r.value)}
                  className={
                    "flex flex-1 flex-col items-center gap-1 rounded-[var(--radius-md)] border py-3 transition active:scale-95 " +
                    (selected
                      ? "border-brand bg-brand-soft"
                      : "border-line-strong bg-surface hover:bg-surface-sunken")
                  }
                >
                  <span className="text-2xl leading-none">{r.emoji}</span>
                  <span
                    className={
                      "text-[11px] font-semibold " + (selected ? "text-brand-ink" : "text-ink-faint")
                    }
                  >
                    {r.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. What would you change? (optional) */}
        <div className="flex flex-col gap-2">
          <label htmlFor="feedback-improvement" className="text-sm font-semibold text-ink">
            Anything you&apos;d change?{" "}
            <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <textarea
            id="feedback-improvement"
            rows={2}
            value={improvement}
            onChange={(e) => setImprovement(e.target.value)}
            maxLength={1000}
            placeholder="Tell us what would make this better…"
            className="w-full resize-none rounded-[var(--radius-md)] border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
          />
        </div>

        {/* 3. Product interest (optional) */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-ink">
            Interested in this look{product?.name ? ` (${product.name})` : ""}?{" "}
            <span className="font-normal text-ink-faint">(optional)</span>
          </span>
          <div className="flex flex-col gap-2">
            {INTEREST_OPTIONS.map((opt) => {
              const selected = interest === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setInterest(selected ? null : opt.value)}
                  className={
                    "flex items-center gap-2.5 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-left text-sm font-medium transition active:scale-[0.99] " +
                    (selected
                      ? "border-brand bg-brand-soft text-brand-ink"
                      : "border-line-strong bg-surface text-ink hover:bg-surface-sunken")
                  }
                >
                  <span
                    className={
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border " +
                      (selected ? "border-brand" : "border-line-strong")
                    }
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <Button variant="ghost" size="lg" onClick={onClose} disabled={submitting}>
            Skip
          </Button>
          <Button
            size="lg"
            fullWidth
            loading={submitting}
            disabled={rating === null}
            onClick={handleSubmit}
          >
            Submit
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
