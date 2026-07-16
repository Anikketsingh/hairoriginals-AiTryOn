"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Check, Loader2, Package, Upload, Sparkles, ArrowRight } from "lucide-react";
import Button from "@/components/ui/Button";
import StickyActionBar from "@/components/ui/StickyActionBar";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Sheet from "@/components/ui/Sheet";
import { cn } from "@/components/ui/cn";
import { fileToUploadedImage, urlToUploadedImage } from "@/lib/image";
import { trackAnalyticsEvent } from "@/lib/analytics-client";
import { ACCEPTED_IMAGE_TYPES, type Category, type Product, type UploadedImage } from "@/lib/types";

interface StyleStepProps {
  productImage?: UploadedImage;
  sessionToken?: string | null;
  onSelect: (img: UploadedImage | undefined, product?: Product) => void;
  onTryOn: () => void;
}

export default function StyleStep({ productImage, sessionToken, onSelect, onTryOn }: StyleStepProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("women");
  const [showGenderSheet, setShowGenderSheet] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  // Gender bootstrap + cross-component sync
  useEffect(() => {
    const stored = localStorage.getItem("ho_selected_gender");
    if (stored) setGender(stored);
    else setShowGenderSheet(true);

    const onChange = () => {
      setGender(localStorage.getItem("ho_selected_gender") || "women");
      setSelectedCategory(null);
    };
    window.addEventListener("ho_gender_changed", onChange);
    return () => window.removeEventListener("ho_gender_changed", onChange);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [catRes, prodRes] = await Promise.all([fetch("/api/categories"), fetch("/api/products")]);
        if (catRes.ok) setCategories(await catRes.json());
        if (prodRes.ok) setProducts(await prodRes.json());
      } catch (err) {
        console.error("[StyleStep] catalog load failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const chooseGender = (g: "women" | "men") => {
    setGender(g);
    localStorage.setItem("ho_selected_gender", g);
    setShowGenderSheet(false);
    window.dispatchEvent(new Event("ho_gender_changed"));
  };

  const selectProduct = useCallback(
    async (product: Product) => {
      setSelectingId(product.id);
      try {
        const img = await urlToUploadedImage(product.image_url, `${product.slug}.jpg`, product.id);
        onSelect(img, product);
        trackAnalyticsEvent("style_selected", { productId: product.id }, sessionToken);
      } catch (err) {
        console.error("[StyleStep] product image load failed:", err);
      } finally {
        setSelectingId(null);
      }
    },
    [onSelect, sessionToken]
  );

  const handleCustomUpload = useCallback(
    async (file: File) => {
      try {
        const img = await fileToUploadedImage(file);
        onSelect(img);
        trackAnalyticsEvent("style_selected", { custom: true }, sessionToken);
      } catch (err) {
        console.error("[StyleStep] custom upload failed:", err);
      }
    },
    [onSelect, sessionToken]
  );

  const visibleCategories = categories.filter(
    (c) => gender === "all" || c.gender === gender || c.gender === "unisex"
  );
  const visibleProducts = products.filter((p) => {
    const g = gender === "all" || p.gender === gender || p.gender === "unisex" || !p.gender;
    const cat = selectedCategory ? p.category_id === selectedCategory : true;
    const q = search
      ? p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku?.toLowerCase().includes(search.toLowerCase()) ?? false)
      : true;
    return g && cat && q;
  });

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pt-20 pb-32 animate-fade-in">
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Pick a style</h1>
          <p className="mt-1.5 text-[15px] text-ink-soft">Tap a look to try it on.</p>
        </div>
        {/* Gender toggle */}
        <div className="flex rounded-full border border-line bg-surface p-0.5 shadow-[var(--shadow-card)]">
          {(["women", "men"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => chooseGender(g)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-colors",
                gender === g ? "bg-brand text-white" : "text-ink-soft"
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search styles…"
          className="min-h-12 w-full rounded-[var(--radius-md)] border border-line-strong bg-surface pl-10 pr-4 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {/* Category chips */}
      <div className="no-scrollbar mt-3 -mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-1">
        <Chip active={selectedCategory === null} onClick={() => setSelectedCategory(null)}>
          All
        </Chip>
        {visibleCategories.map((c) => (
          <Chip key={c.id} active={selectedCategory === c.id} onClick={() => setSelectedCategory(c.id)}>
            {c.name}
          </Chip>
        ))}
      </div>

      {/* Grid */}
      <div className="mt-4 flex-1">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full" rounded="rounded-[var(--radius-lg)]" />
            ))}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-12 text-center">
            <Package className="h-10 w-10 text-line-strong" />
            <p className="text-sm font-medium text-ink-soft">No styles found. Try another search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleProducts.map((p) => {
              const selected = productImage?.productId === p.id;
              const busy = selectingId === p.id;
              const price = p.selling_price || p.price || 0;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => !busy && selectProduct(p)}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-surface text-left transition-all active:scale-[0.98]",
                    selected
                      ? "border-brand ring-2 ring-brand/30 shadow-[var(--shadow-card)]"
                      : "border-line hover:border-line-strong shadow-[var(--shadow-card)]"
                  )}
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      draggable={false}
                    />
                    {p.is_best_seller && (
                      <span className="absolute left-2 top-2">
                        <Badge tone="brand">Bestseller</Badge>
                      </span>
                    )}
                    {busy && (
                      <div className="absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-sm">
                        <Loader2 className="h-6 w-6 animate-spin text-brand" />
                      </div>
                    )}
                    {selected && !busy && (
                      <div className="absolute right-2 top-2 flex h-7 w-7 animate-scale-in items-center justify-center rounded-full bg-brand text-white shadow-md">
                        <Check className="h-4 w-4 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-2.5">
                    <p className="line-clamp-2 min-h-[2.4rem] text-[13px] font-semibold leading-snug text-ink">
                      {p.name}
                    </p>
                    {price > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-ink">₹{price.toLocaleString()}</span>
                        {p.mrp && p.mrp > price && (
                          <span className="text-xs text-ink-faint line-through">₹{p.mrp.toLocaleString()}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-ink-faint">Free to try</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Upload your own */}
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-line-strong bg-surface py-3.5 text-sm font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand"
        >
          <Upload className="h-4 w-4" /> Upload your own style photo
        </button>
        <input
          ref={uploadRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleCustomUpload(f);
            e.target.value = "";
          }}
          className="sr-only"
          aria-hidden="true"
        />
      </div>

      {/* Sticky Try-on CTA */}
      <StickyActionBar>
        <div className="mx-auto flex max-w-md items-center gap-3 pb-3">
          {productImage?.dataUrl && (
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={productImage.dataUrl} alt="Selected style" className="h-full w-full object-cover" />
            </div>
          )}
          <Button
            size="lg"
            fullWidth
            disabled={!productImage}
            onClick={onTryOn}
            leftIcon={<Sparkles className="h-5 w-5" />}
            rightIcon={<ArrowRight className="h-5 w-5" />}
          >
            {productImage ? "Try this on" : "Pick a style"}
          </Button>
        </div>
      </StickyActionBar>

      {/* First-run gender sheet */}
      <Sheet open={showGenderSheet} onClose={() => setShowGenderSheet(false)} title="Who's this for?">
        <p className="mb-4 text-sm text-ink-soft">We&apos;ll show styles made for you.</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { g: "women" as const, emoji: "👩", sub: "Toppers, Extensions, Wigs" },
            { g: "men" as const, emoji: "👨", sub: "Patches, Hairstyles, Wigs" },
          ]).map(({ g, emoji, sub }) => (
            <button
              key={g}
              type="button"
              onClick={() => chooseGender(g)}
              className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-line bg-surface p-5 text-center transition-all hover:border-brand active:scale-95"
            >
              <span className="text-4xl">{emoji}</span>
              <span className="text-sm font-bold capitalize text-ink">{g}</span>
              <span className="text-[11px] text-ink-faint">{sub}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
        active
          ? "border-brand bg-brand-soft text-brand-ink"
          : "border-line bg-surface text-ink-soft hover:border-line-strong"
      )}
    >
      {children}
    </button>
  );
}
