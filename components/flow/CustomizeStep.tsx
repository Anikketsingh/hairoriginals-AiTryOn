"use client";

import { Check, Sparkles, ArrowRight } from "lucide-react";
import Button from "@/components/ui/Button";
import StickyActionBar from "@/components/ui/StickyActionBar";
import { cn } from "@/components/ui/cn";
import type { CustomizationAttribute, Product, UploadedImage } from "@/lib/types";

interface CustomizeStepProps {
  productImage?: UploadedImage;
  product?: Product | null;
  attributes: CustomizationAttribute[];
  /** attribute key → selected option id. Every enabled attribute always has
   *  an entry — the first option is preselected when the screen loads. */
  selections: Record<string, string>;
  onSelect: (attributeKey: string, optionId: string) => void;
  onTryOn: () => void;
}

export default function CustomizeStep({
  productImage,
  product,
  attributes,
  selections,
  onSelect,
  onTryOn,
}: CustomizeStepProps) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pt-20 pb-32 animate-fade-in">
      <div className="mt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Customize your look</h1>
        <p className="mt-1.5 text-[15px] text-ink-soft">Fine-tune the colour and length, then try it on.</p>
      </div>

      {/* Selected style preview */}
      {productImage?.dataUrl && (
        <div className="mt-5 flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-3 shadow-[var(--shadow-card)]">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-sunken">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={productImage.dataUrl} alt={product?.name ?? "Selected style"} className="h-full w-full object-cover" />
          </div>
          {product?.name && <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{product.name}</p>}
        </div>
      )}

      {/* Attribute sections */}
      <div className="mt-6 flex flex-col gap-6">
        {attributes.map((attr) => (
          <div key={attr.key} className="flex flex-col gap-2.5">
            <span className="text-sm font-bold text-ink">{attr.label}</span>
            <div className="flex flex-wrap gap-2.5">
              {attr.options.map((opt) => {
                const selected = selections[attr.key] === opt.id;
                if (attr.ui_type === "swatch") {
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSelect(attr.key, opt.id)}
                      aria-label={opt.label}
                      aria-pressed={selected}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <span
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-full border-2 shadow-[var(--shadow-card)] transition-all active:scale-90",
                          selected ? "border-brand ring-2 ring-brand/30" : "border-line"
                        )}
                        style={{ backgroundColor: opt.swatch_hex ?? "#CCCCCC" }}
                      >
                        {selected && <Check className="h-4 w-4 stroke-[3] text-white drop-shadow" />}
                      </span>
                      <span className="max-w-[4.5rem] truncate text-[11px] font-medium text-ink-soft">{opt.label}</span>
                    </button>
                  );
                }
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSelect(attr.key, opt.id)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                      selected ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface text-ink-soft hover:border-line-strong"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <StickyActionBar>
        <div className="mx-auto flex max-w-md items-center gap-3 pb-3">
          <Button
            size="lg"
            fullWidth
            onClick={onTryOn}
            leftIcon={<Sparkles className="h-5 w-5" />}
            rightIcon={<ArrowRight className="h-5 w-5" />}
          >
            Try this on
          </Button>
        </div>
      </StickyActionBar>
    </div>
  );
}
