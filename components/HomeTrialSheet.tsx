"use client";

import { X, ArrowRight } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { Button, IconButton } from "@/components/ui";
import type { HomeTrialOffer } from "@/lib/types";

interface HomeTrialSheetProps {
  open: boolean;
  offer: HomeTrialOffer | null;
  /** Dismissed without converting. */
  onClose: () => void;
  /** Tapped through to the booking page. */
  onBook: () => void;
}

/**
 * The home trial offer, as a one-shot sheet on the result screen.
 *
 * Timing, frequency and audience all live in hooks/useHomeTrial.ts — this
 * component only renders what that decided to show.
 *
 * Deliberately headline-free: the admin-managed creative already carries the
 * pitch ("Try Hair Extensions at Home", before/after), so a heading above it
 * would just say the same thing twice. Three ways out — the X, "Maybe later",
 * and Sheet's own backdrop tap / Escape.
 */
export default function HomeTrialSheet({ open, offer, onClose, onBook }: HomeTrialSheetProps) {
  if (!offer) return null;

  return (
    <Sheet open={open} onClose={onClose} hideHeader className="max-w-md">
      {/* Full-bleed against Sheet's px-5 padding. The rounding only matters on
          sm+, where the drag handle is hidden and the image meets the panel's
          own top corners. */}
      <div className="relative -mx-5 overflow-hidden sm:rounded-t-[var(--radius-xl)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={offer.imageUrl}
          alt={offer.ctaLabel}
          className="aspect-square w-full object-cover"
        />
        <IconButton
          label="Close"
          variant="glass"
          onClick={onClose}
          className="absolute right-3 top-3 h-9 w-9"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {offer.subtext && (
          <p className="text-center text-[15px] text-ink-soft">{offer.subtext}</p>
        )}
        <Button
          size="lg"
          fullWidth
          onClick={onBook}
          rightIcon={<ArrowRight className="h-5 w-5" aria-hidden="true" />}
        >
          {offer.ctaLabel}
        </Button>
        <Button variant="ghost" size="md" fullWidth onClick={onClose}>
          Maybe later
        </Button>
      </div>
    </Sheet>
  );
}
