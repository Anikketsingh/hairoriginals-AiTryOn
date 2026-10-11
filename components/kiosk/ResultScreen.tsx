"use client";

/**
 * Result: the generated look large, with a Before/After slider (reused from
 * the web app), the "send my looks to my phone" card (the standee's lead
 * capture — see QrHandoffPanel) and the next actions.
 */

import { useState } from "react";
import { ArrowRight, Images, Sparkles } from "lucide-react";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import { cn } from "@/components/ui/cn";
import { KioskLogo, PrimaryButton, SecondaryButton } from "@/components/kiosk/ui";
import TakeHomeCard from "@/components/kiosk/TakeHomeCard";

export default function ResultScreen({
  resultUrl,
  photoUrl,
  styleName,
  triesLeft,
  discountPercent,
  sentToPhone,
  onTakeHome,
  onTryAnother,
  onFinish,
}: {
  resultUrl: string;
  photoUrl?: string;
  styleName?: string;
  triesLeft: number;
  discountPercent: number;
  sentToPhone: boolean;
  onTakeHome: () => void;
  onTryAnother: () => void;
  onFinish: () => void;
}) {
  const [view, setView] = useState<"result" | "compare">("result");

  return (
    <div className="flex h-full flex-col items-center bg-canvas px-12 pt-[3.5vh]">
      <KioskLogo className="h-12" />
      <h1 className="mt-6 flex items-center gap-4 text-[56px] font-extrabold tracking-tight text-ink">
        <Sparkles className="h-12 w-12 text-brand" /> Your new look
      </h1>
      {styleName && <p className="mt-2 text-[28px] text-ink-soft">{styleName}</p>}

      <div className="relative mt-6 w-[60vw] overflow-hidden rounded-[56px] border-[6px] border-surface bg-surface-sunken shadow-[var(--shadow-pop)]">
        {view === "compare" && photoUrl ? (
          <div className="[&_*]:!rounded-none">
            <BeforeAfterSlider beforeImage={photoUrl} afterImage={resultUrl} />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resultUrl} alt="Your try-on result" className="block aspect-[3/4] w-full object-cover" />
        )}
      </div>

      {photoUrl && (
        <div className="mt-6 flex rounded-full border border-line bg-surface p-1.5 shadow-[var(--shadow-card)]">
          {(
            [
              ["result", "New look"],
              ["compare", "Before / After"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "min-h-[72px] rounded-full px-10 text-[26px] font-bold transition-colors",
                view === v ? "bg-brand text-white" : "text-ink-soft"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 w-full">
        <TakeHomeCard discountPercent={discountPercent} done={sentToPhone} onClick={onTakeHome} />
      </div>

      <div className="mt-auto flex w-full flex-col gap-5 pb-[4vh] pt-6">
        {triesLeft > 0 ? (
          <SecondaryButton onClick={onTryAnother} className="w-full">
            <Images className="h-10 w-10" /> Try another style
            <span className="text-ink-faint">({triesLeft} left)</span>
          </SecondaryButton>
        ) : (
          <p className="text-center text-[26px] text-ink-soft">You&apos;ve tried all your styles for this visit.</p>
        )}
        <PrimaryButton onClick={onFinish} className="w-full">
          I&apos;m done <ArrowRight className="h-10 w-10" />
        </PrimaryButton>
      </div>
    </div>
  );
}
