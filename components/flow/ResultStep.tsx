"use client";

import { useCallback, useState } from "react";
import { Download, Heart, Share2, Sparkles, Home, Eye, SlidersHorizontal, ShoppingBag, ArrowRight } from "lucide-react";
import Button from "@/components/ui/Button";
import StickyActionBar from "@/components/ui/StickyActionBar";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import { useToast } from "@/components/ui/Toast";
import { trackAnalyticsEvent } from "@/lib/analytics-client";
import { cn } from "@/components/ui/cn";
import type { Product } from "@/lib/types";

interface ResultStepProps {
  imageUrl: string;
  mimeType: string;
  personImage?: string;
  product?: Product | null;
  generationId?: string | null;
  sessionToken?: string | null;
  onTryAnother: () => void;
  onStartOver: () => void;
}

const STORE_URL = (process.env.NEXT_PUBLIC_STORE_URL || "https://hairoriginals.com").replace(/\/$/, "");

function productUrl(product: Product): string {
  return `${STORE_URL}/products/${product.slug}`;
}

async function urlToFile(url: string, mimeType: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = mimeType.split("/")[1] ?? "png";
  return new File([blob], `hairoriginals-look-${Date.now()}.${ext}`, { type: mimeType });
}

export default function ResultStep({
  imageUrl,
  mimeType,
  personImage,
  product,
  generationId,
  sessionToken,
  onTryAnother,
  onStartOver,
}: ResultStepProps) {
  const { toast } = useToast();
  const [view, setView] = useState<"compare" | "result">(personImage ? "compare" : "result");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const imageSrc = imageUrl;
  const productId = product?.id;

  const price = product ? product.selling_price || product.price || 0 : 0;
  const hasDiscount = !!product?.mrp && product.mrp > price;

  const handleDownload = useCallback(async () => {
    // imageSrc is a cross-origin signed URL now (not a same-origin data:
    // URL), and browsers ignore the anchor `download` attribute for
    // cross-origin hrefs — fetch the bytes first and download a same-origin
    // blob: URL instead, which always respects it.
    try {
      const ext = mimeType.split("/")[1] ?? "png";
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `hairoriginals-look-${Date.now()}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      toast("Saved to your device", "success");
      trackAnalyticsEvent("downloaded", { productId }, sessionToken);
    } catch {
      toast("Couldn't download right now. Try again.", "error");
    }
  }, [imageSrc, mimeType, toast, productId, sessionToken]);

  const handleShare = useCallback(async () => {
    try {
      const file = await urlToFile(imageSrc, mimeType);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "My HairOriginals look",
          text: "Check out my new hairstyle!",
        });
        trackAnalyticsEvent("shared", { productId }, sessionToken);
        return;
      }
      handleDownload();
    } catch (err) {
      if ((err as Error).name !== "AbortError") handleDownload();
    }
  }, [imageSrc, mimeType, handleDownload, productId, sessionToken]);

  const handleSave = useCallback(async () => {
    if (saved || saving) return;
    if (!sessionToken) {
      toast("Sign in to save your looks", "info");
      return;
    }
    // Catalog style → save the product (so it can be re-tried from My Looks).
    // Custom upload → save the generated look itself (no product to reference).
    const endpoint = productId ? "/api/customer/saved" : "/api/customer/save-look";
    const body = productId ? { sessionToken, productId } : { sessionToken, generationId };
    if (!productId && !generationId) {
      toast("This look can't be saved yet. Try again.", "info");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      toast("Added to your saved looks", "success");
      trackAnalyticsEvent("saved", { productId, custom: !productId }, sessionToken);
    } catch {
      toast("Couldn't save right now. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }, [saved, saving, productId, generationId, sessionToken, toast]);

  const handleShop = useCallback(() => {
    if (!product) return;
    trackAnalyticsEvent("shop_this_look_clicked", { productId: product.id }, sessionToken);
    window.open(productUrl(product), "_blank", "noopener,noreferrer");
  }, [product, sessionToken]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pt-20 pb-44 animate-fade-in">
      {/* Success header */}
      <div className="mt-2 flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-bold text-success">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Here&apos;s your new look
        </span>
      </div>

      {/* View toggle */}
      {personImage && (
        <div
          role="tablist"
          aria-label="Result view"
          className="mx-auto mt-4 flex rounded-full border border-line bg-surface p-0.5 shadow-[var(--shadow-card)]"
        >
          <ToggleBtn active={view === "compare"} onClick={() => setView("compare")} icon={<SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />}>
            Before / After
          </ToggleBtn>
          <ToggleBtn active={view === "result"} onClick={() => setView("result")} icon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}>
            Result
          </ToggleBtn>
        </div>
      )}

      {/* Image */}
      <div className="mt-5">
        {view === "compare" && personImage ? (
          <BeforeAfterSlider beforeImage={personImage} afterImage={imageUrl} mimeType={mimeType} />
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
          icon={<Heart className={cn("h-5 w-5", saved && "fill-brand text-brand")} aria-hidden="true" />}
          active={saved}
          pressed={saved}
        />
        <QuickAction label="Share" onClick={handleShare} icon={<Share2 className="h-5 w-5" aria-hidden="true" />} />
        <QuickAction label="Download" onClick={handleDownload} icon={<Download className="h-5 w-5" aria-hidden="true" />} />
      </div>

      {/* Shop this look — the product that created this result */}
      {product && (
        <div className="mt-6 flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-3 shadow-[var(--shadow-card)]">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-bold text-ink">{product.name}</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-[15px] font-extrabold text-ink">₹{price.toLocaleString()}</span>
              {hasDiscount && (
                <>
                  <span className="text-xs text-ink-faint line-through">₹{product.mrp!.toLocaleString()}</span>
                  <span className="text-[11px] font-bold text-success">
                    {Math.round(((product.mrp! - price) / product.mrp!) * 100)}% off
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Start over — inline (scrolls above the pinned CTAs; the TopBar back
          arrow also triggers this) */}
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={onStartOver}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] py-2 px-3 text-sm font-semibold text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
        >
          <Home className="h-4 w-4" aria-hidden="true" /> Start over
        </button>
      </div>

      {/* Primary CTAs — pinned to the bottom of the screen */}
      <StickyActionBar>
        <div className="mx-auto flex max-w-md flex-col gap-2.5 pb-3">
          {product ? (
            <>
              <Button
                size="lg"
                fullWidth
                onClick={handleShop}
                leftIcon={<ShoppingBag className="h-5 w-5" aria-hidden="true" />}
                rightIcon={<ArrowRight className="h-5 w-5" aria-hidden="true" />}
              >
                Shop this look
              </Button>
              <Button
                size="lg"
                variant="secondary"
                fullWidth
                onClick={onTryAnother}
                leftIcon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
              >
                Try another style
              </Button>
            </>
          ) : (
            <Button size="lg" fullWidth onClick={onTryAnother} leftIcon={<Sparkles className="h-5 w-5" aria-hidden="true" />}>
              Try another style
            </Button>
          )}
        </div>
      </StickyActionBar>
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-brand",
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
  pressed,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] p-1 transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-brand"
    >
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