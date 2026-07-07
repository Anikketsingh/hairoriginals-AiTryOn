"use client";

import { useCallback, useState } from "react";
import { Download, Heart, Share2, Sparkles, Home, Eye, SlidersHorizontal } from "lucide-react";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";

interface ResultStepProps {
  imageBase64: string;
  mimeType: string;
  personImage?: string;
  productId?: string;
  sessionToken?: string | null;
  onTryAnother: () => void;
  onStartOver: () => void;
}

async function base64ToFile(dataUrl: string, mimeType: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = mimeType.split("/")[1] ?? "png";
  return new File([blob], `hairoriginals-look-${Date.now()}.${ext}`, { type: mimeType });
}

export default function ResultStep({
  imageBase64,
  mimeType,
  personImage,
  productId,
  sessionToken,
  onTryAnother,
  onStartOver,
}: ResultStepProps) {
  const { toast } = useToast();
  const [view, setView] = useState<"compare" | "result">(personImage ? "compare" : "result");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const imageSrc = `data:${mimeType};base64,${imageBase64}`;

  const handleDownload = useCallback(() => {
    const ext = mimeType.split("/")[1] ?? "png";
    const link = document.createElement("a");
    link.href = imageSrc;
    link.download = `hairoriginals-look-${Date.now()}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Saved to your device", "success");
  }, [imageSrc, mimeType, toast]);

  const handleShare = useCallback(async () => {
    try {
      const file = await base64ToFile(imageSrc, mimeType);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "My HairOriginals look",
          text: "Check out my new hairstyle!",
        });
        return;
      }
      handleDownload();
    } catch (err) {
      if ((err as Error).name !== "AbortError") handleDownload();
    }
  }, [imageSrc, mimeType, handleDownload]);

  const handleSave = useCallback(async () => {
    if (saved || saving) return;
    if (!productId || !sessionToken) {
      toast("Only catalog styles can be saved", "info");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/customer/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, productId }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      toast("Added to your saved looks", "success");
    } catch {
      toast("Couldn't save right now. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }, [saved, saving, productId, sessionToken, toast]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pt-20 pb-8 animate-fade-in">
      {/* Success header */}
      <div className="mt-2 flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-bold text-success">
          <Sparkles className="h-3.5 w-3.5" /> Here&apos;s your new look
        </span>
      </div>

      {/* View toggle */}
      {personImage && (
        <div className="mx-auto mt-4 flex rounded-full border border-line bg-surface p-0.5 shadow-[var(--shadow-card)]">
          <ToggleBtn active={view === "compare"} onClick={() => setView("compare")} icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>
            Before / After
          </ToggleBtn>
          <ToggleBtn active={view === "result"} onClick={() => setView("result")} icon={<Eye className="h-3.5 w-3.5" />}>
            Result
          </ToggleBtn>
        </div>
      )}

      {/* Image */}
      <div className="mt-5">
        {view === "compare" && personImage ? (
          <BeforeAfterSlider beforeImage={personImage} afterImage={imageBase64} mimeType={mimeType} />
        ) : (
          <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface-sunken shadow-[var(--shadow-pop)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc} alt="Your AI hair try-on result" className="h-full w-full object-contain" />
          </div>
        )}
      </div>

      {/* Quick actions row */}
      <div className="mt-5 flex items-center justify-center gap-6">
        <QuickAction
          label={saved ? "Saved" : "Save"}
          onClick={handleSave}
          icon={<Heart className={cn("h-5 w-5", saved && "fill-brand text-brand")} />}
          active={saved}
        />
        <QuickAction label="Share" onClick={handleShare} icon={<Share2 className="h-5 w-5" />} />
        <QuickAction label="Download" onClick={handleDownload} icon={<Download className="h-5 w-5" />} />
      </div>

      {/* Primary looping CTAs */}
      <div className="mt-6 flex flex-col gap-3">
        <Button size="lg" fullWidth onClick={onTryAnother} leftIcon={<Sparkles className="h-5 w-5" />}>
          Try another style
        </Button>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onStartOver}
            className="inline-flex items-center gap-1.5 py-2 text-sm font-semibold text-ink-soft hover:text-ink transition-colors"
          >
            <Home className="h-4 w-4" /> Start over
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors",
        active ? "bg-brand text-white" : "text-ink-soft"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function QuickAction({
  label,
  onClick,
  icon,
  active,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform">
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full border shadow-[var(--shadow-card)] transition-colors",
          active ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-ink-soft"
        )}
      >
        {icon}
      </span>
      <span className="text-[11px] font-semibold text-ink-soft">{label}</span>
    </button>
  );
}
