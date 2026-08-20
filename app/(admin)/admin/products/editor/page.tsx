"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Sparkles, History, RotateCcw, Loader2, Plus, Trash2, CheckCircle2, UploadCloud, Link2, Palette, AlertTriangle } from "lucide-react";
import AdminImageUploader from "@/components/admin/AdminImageUploader";
import type { Category, ProductVersion } from "@/lib/types";
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/format";

interface CustomizationOptionLite {
  id: string;
  attribute_id: string;
  label: string;
  swatch_hex: string | null;
  is_active: boolean;
}

interface CustomizationAttributeLite {
  id: string;
  key: string;
  label: string;
  ui_type: "swatch" | "chip" | "thumbnail";
  is_active: boolean;
}


function ProductEditorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get("id");

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "specs" | "display" | "ai_assets" | "customization" | "prompt" | "history">("basic");

  // Product Form State
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [gender, setGender] = useState<"women" | "men" | "unisex">("women");
  const [brand, setBrand] = useState("HairOriginals");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [sellingPrice, setSellingPrice] = useState<number | "">("");
  const [mrp, setMrp] = useState<number | "">("");
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [discountPercentage, setDiscountPercentage] = useState<number | "">("");
  const [imageUrl, setImageUrl] = useState("");
  const [shopUrl, setShopUrl] = useState("");
  const [status, setStatus] = useState<"published" | "draft" | "archived">("published");

  // Hair specs
  const [hairType, setHairType] = useState("");
  const [hairLength, setHairLength] = useState("");
  const [hairDensity, setHairDensity] = useState("");
  const [hairColor, setHairColor] = useState("");
  const [baseMaterial, setBaseMaterial] = useState("");
  const [installationType, setInstallationType] = useState("");
  const [recommendedFor, setRecommendedFor] = useState("");

  // Display flags
  const [isFeatured, setIsFeatured] = useState(false);
  const [isNewArrival, setIsNewArrival] = useState(false);
  const [isBestSeller, setIsBestSeller] = useState(false);
  const [isTrending, setIsTrending] = useState(false);

  // AI Assets & Prompt Override
  const [promptOverride, setPromptOverride] = useState("");
  const [aiAssets, setAiAssets] = useState<{ asset_type: string; url: string }[]>([
    { asset_type: "front", url: "" },
    { asset_type: "side", url: "" },
  ]);

  // Hair Customization (Colour & Length)
  const [customizationEnabled, setCustomizationEnabled] = useState(false);
  const [customizationOptionIds, setCustomizationOptionIds] = useState<string[]>([]);
  const [customizationAttributes, setCustomizationAttributes] = useState<CustomizationAttributeLite[]>([]);
  const [customizationOptions, setCustomizationOptions] = useState<CustomizationOptionLite[]>([]);

  // Versions history
  const [versions, setVersions] = useState<ProductVersion[]>([]);

  const loadInitialData = useCallback(async () => {
    try {
      const [catRes, attrRes, optRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/admin/customization/attributes"),
        fetch("/api/admin/customization/options"),
      ]);
      if (catRes.ok) setCategories(await catRes.json());
      if (attrRes.ok) setCustomizationAttributes(await attrRes.json());
      if (optRes.ok) setCustomizationOptions(await optRes.json());

      if (productId) {
        const prodRes = await fetch(`/api/admin/products/${productId}`);
        if (prodRes.ok) {
          const data = await prodRes.json();
          setName(data.name || "");
          setSlug(data.slug || "");
          setSku(data.sku || "");
          setCategoryId(data.category_id || "");
          setGender(data.gender || "women");
          setBrand(data.brand || "HairOriginals");
          setShortDescription(data.short_description || "");
          setDescription(data.description || "");
          setSellingPrice(data.selling_price || data.price || "");
          setMrp(data.mrp || "");
          setCurrency(data.currency || DEFAULT_CURRENCY);
          setDiscountPercentage(data.discount_percentage || "");
          setImageUrl(data.image_url || "");
          setShopUrl(data.shop_url || "");
          setStatus(data.status || "published");
          setHairType(data.hair_type || "");
          setHairLength(data.hair_length || "");
          setHairDensity(data.hair_density || "");
          setHairColor(data.hair_color || "");
          setBaseMaterial(data.base_material || "");
          setInstallationType(data.installation_type || "");
          setRecommendedFor(data.recommended_for || "");
          setIsFeatured(!!data.is_featured);
          setIsNewArrival(!!data.is_new_arrival);
          setIsBestSeller(!!data.is_best_seller);
          setIsTrending(!!data.is_trending);
          setPromptOverride(data.prompt_override || "");
          if (data.product_ai_assets) setAiAssets(data.product_ai_assets);
          if (data.product_versions) setVersions(data.product_versions);
          setCustomizationEnabled(!!data.customization_enabled);
          if (Array.isArray(data.product_customization_options)) {
            setCustomizationOptionIds(
              data.product_customization_options.map((row: { option_id: string }) => row.option_id)
            );
          }
        }
      }
    } catch (err) {
      console.error("Failed to load product data:", err);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleSave = async () => {
    if (!name || !imageUrl) return alert("Please fill in Product Name and Hero Image URL.");
    setSaving(true);
    try {
      const payload = {
        name,
        slug,
        sku,
        category_id: categoryId || null,
        gender,
        brand,
        short_description: shortDescription,
        description,
        selling_price: Number(sellingPrice) || 0,
        mrp: Number(mrp) || 0,
        currency,
        discount_percentage: Number(discountPercentage) || 0,
        image_url: imageUrl,
        shop_url: shopUrl.trim(),
        status,
        hair_type: hairType,
        hair_length: hairLength,
        hair_density: hairDensity,
        hair_color: hairColor,
        base_material: baseMaterial,
        installation_type: installationType,
        recommended_for: recommendedFor,
        is_featured: isFeatured,
        is_new_arrival: isNewArrival,
        is_best_seller: isBestSeller,
        is_trending: isTrending,
        prompt_override: promptOverride,
        ai_assets: aiAssets.filter((a) => a.url.trim() !== ""),
        customization_enabled: customizationEnabled,
        customization_option_ids: customizationOptionIds,
      };

      const endpoint = productId ? `/api/admin/products/${productId}` : "/api/admin/products";
      const method = productId ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        router.push("/admin/products");
      } else {
        alert("Failed to save product.");
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!productId || !confirm("Rollback to this version snapshot?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/products/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, versionId }),
      });
      if (res.ok) {
        await loadInitialData();
        alert("Product successfully restored!");
      }
    } catch (err) {
      console.error("Rollback error:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span className="text-xs">Loading Product Editor…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/8">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <Link href="/admin/products" className="shrink-0 p-2.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
              {productId ? `Edit Product: ${name}` : "Create New Hair Product"}
            </h1>
            <p className="text-xs text-white/40 mt-0.5">Configure hair specs, AI reference assets, pricing, and prompt overrides.</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-6 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-white font-bold text-xs shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Product
        </button>
      </div>

      {/* Navigation Tabs — swipeable, bleeding to the screen edge on phones */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-white/8 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        {[
          { id: "basic", label: "Basic Info & Pricing" },
          { id: "specs", label: "Hair & Technical Specs" },
          { id: "display", label: "Display & Status" },
          { id: "ai_assets", label: "AI Reference Assets" },
          { id: "customization", label: "Customization" },
          { id: "prompt", label: "AI Prompt Override" },
          ...(productId ? [{ id: "history", label: "Version Audit Log" }] : []),
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-6">
        {/* TAB 1: Basic Info & Pricing */}
        {activeTab === "basic" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">Product Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">SKU Code</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">Target Gender *</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as typeof gender)}
                className="px-3 py-2 rounded-xl bg-black border border-white/10 text-white text-xs focus:outline-none"
              >
                <option value="women">👩 Women</option>
                <option value="men">👨 Men</option>
                <option value="unisex">👫 Unisex</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-black border border-white/10 text-white text-xs focus:outline-none"
              >
                <option value="">Select Category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.gender})</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <AdminImageUploader
                label="Hero Image *"
                value={imageUrl}
                onChange={setImageUrl}
                placeholder="Hero Image URL..."
              />
            </div>

            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-amber-400" /> Shop Link (External Product URL)
              </label>
              <input
                type="url"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                placeholder="https://hairoriginals.com/products/..."
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400/50"
              />
              <p className="text-[10px] text-white/30">
                Where &quot;Shop this look&quot; sends the customer. Leave blank to fall back to the storefront URL built from the product slug.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code} className="bg-neutral-900">
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-white/30">
                Both prices below are in this currency. Customer-facing cards format
                the symbol and separators from it.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">Selling Price ({currency})</label>
              <input
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value === "" ? "" : Number(e.target.value))}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-emerald-400 font-bold text-xs focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              {/* "MRP" is India-specific (Legal Metrology Act). Outside India the
                  same field is an advisory compare-at / RRP figure. */}
              <label className="text-xs font-semibold text-white/70">
                {currency === "INR" ? `MRP (${currency})` : `Compare-at price (${currency})`}
              </label>
              <input
                type="number"
                value={mrp}
                onChange={(e) => setMrp(e.target.value === "" ? "" : Number(e.target.value))}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* TAB 2: Hair & Technical Specs */}
        {activeTab === "specs" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">Hair Type</label>
              <input type="text" value={hairType} onChange={(e) => setHairType(e.target.value)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">Hair Length</label>
              <input type="text" value={hairLength} onChange={(e) => setHairLength(e.target.value)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">Hair Density</label>
              <input type="text" value={hairDensity} onChange={(e) => setHairDensity(e.target.value)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">Base Material</label>
              <input type="text" value={baseMaterial} onChange={(e) => setBaseMaterial(e.target.value)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs" />
            </div>
          </div>
        )}

        {/* TAB 3: Display Settings */}
        {activeTab === "display" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-white/70">Publication Status</label>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {["published", "draft", "archived"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatus(st as typeof status)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border capitalize transition-all ${
                      status === st
                        ? "bg-amber-400 text-black border-amber-400"
                        : "bg-white/5 border-white/10 text-white/40"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-4 border-t border-white/8">
              <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
                <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} className="rounded bg-white/10" />
                <span className="text-xs font-semibold text-white">Featured Product</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
                <input type="checkbox" checked={isNewArrival} onChange={(e) => setIsNewArrival(e.target.checked)} className="rounded bg-white/10" />
                <span className="text-xs font-semibold text-white">New Arrival</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
                <input type="checkbox" checked={isBestSeller} onChange={(e) => setIsBestSeller(e.target.checked)} className="rounded bg-white/10" />
                <span className="text-xs font-semibold text-white">Best Seller</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
                <input type="checkbox" checked={isTrending} onChange={(e) => setIsTrending(e.target.checked)} className="rounded bg-white/10" />
                <span className="text-xs font-semibold text-white">Trending</span>
              </label>
            </div>
          </div>
        )}

        {/* TAB 4: AI Reference Assets */}
        {activeTab === "ai_assets" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs text-white/50">Provide multi-angle AI reference images to optimize photorealistic hairstyle synthesis.</p>
              </div>
              <button
                type="button"
                onClick={() => setAiAssets([...aiAssets, { asset_type: "front", url: "" }])}
                className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/10 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Add Asset
              </button>
            </div>
            
            <div className="flex flex-col gap-4">
              {aiAssets.length === 0 ? (
                <p className="text-xs text-white/30 py-4">No AI reference assets configured. Click "Add Asset" to add one.</p>
              ) : (
                aiAssets.map((ast, idx) => (
                  <div key={idx} className="p-3 sm:p-4 rounded-xl bg-white/[0.01] border border-white/5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">Asset #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAiAssets(aiAssets.filter((_, i) => i !== idx));
                        }}
                        className="p-1 rounded-lg hover:bg-white/5 text-white/40 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-white/70">Asset Angle</label>
                        <select
                          value={ast.asset_type}
                          onChange={(e) => {
                            const next = [...aiAssets];
                            next[idx].asset_type = e.target.value;
                            setAiAssets(next);
                          }}
                          className="px-3 py-2 rounded-xl bg-black border border-white/10 text-white text-xs capitalize focus:outline-none"
                        >
                          <option value="front">Front Reference</option>
                          <option value="side">Side Reference</option>
                          <option value="back">Back Reference</option>
                          <option value="closeup">Close-Up</option>
                        </select>
                      </div>

                      <div className="md:col-span-3">
                        <AdminImageUploader
                          label="Reference Image"
                          value={ast.url}
                          onChange={(url) => {
                            const next = [...aiAssets];
                            next[idx].url = url;
                            setAiAssets(next);
                          }}
                          placeholder="Image URL..."
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB: Hair Customization (Colour & Length) */}
        {activeTab === "customization" && (
          <div className="flex flex-col gap-6">
            <label className="flex items-start sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-white/5 border border-white/5 cursor-pointer">
              <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                <Palette className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-amber-400" />
                <div>
                  <p className="text-xs font-bold text-white">Enable Hair Colour &amp; Length Customization</p>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    When on, customers who pick this style are shown a customize screen for the options ticked below
                    before generating. When off, generation proceeds exactly as it does today — no extra screen.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={customizationEnabled}
                onChange={(e) => setCustomizationEnabled(e.target.checked)}
                className="shrink-0 w-4 h-4 rounded bg-white/10"
              />
            </label>

            {customizationEnabled && customizationOptionIds.length === 0 && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/25 text-amber-200 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Customization is on but no options are selected — customers will not see the customization screen.</span>
              </div>
            )}

            {customizationAttributes.filter((a) => a.is_active).length === 0 ? (
              <p className="text-xs text-white/30 py-2">
                No customization attributes exist yet. Create some in{" "}
                <a href="/admin/customization" className="text-amber-400 underline">Hair Customization</a>.
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                {customizationAttributes
                  .filter((a) => a.is_active)
                  .map((attr) => {
                    const attrOptions = customizationOptions.filter((o) => o.attribute_id === attr.id && o.is_active);
                    return (
                      <div key={attr.id} className="flex flex-col gap-2.5">
                        <span className="text-xs font-bold text-white/70 uppercase tracking-wider">{attr.label}</span>
                        {attrOptions.length === 0 ? (
                          <p className="text-[11px] text-white/30">No active options for this attribute yet.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {attrOptions.map((opt) => {
                              const checked = customizationOptionIds.includes(opt.id);
                              return (
                                <label
                                  key={opt.id}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                                    checked ? "bg-amber-400/15 border-amber-400/40 text-amber-200" : "bg-white/5 border-white/10 text-white/60"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setCustomizationOptionIds((prev) =>
                                        e.target.checked ? [...prev, opt.id] : prev.filter((id) => id !== opt.id)
                                      )
                                    }
                                    className="rounded bg-white/10"
                                  />
                                  {attr.ui_type === "swatch" && opt.swatch_hex && (
                                    <span
                                      className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                                      style={{ backgroundColor: opt.swatch_hex }}
                                    />
                                  )}
                                  <span className="text-xs">{opt.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AI Prompt Override */}
        {activeTab === "prompt" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Product-Specific Prompt Override</span>
            </div>
            <textarea
              rows={5}
              placeholder="Leave blank to use default category prompt template..."
              value={promptOverride}
              onChange={(e) => setPromptOverride(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400/50"
            />
          </div>
        )}

        {/* TAB 6: Version History & Rollback */}
        {activeTab === "history" && (
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-amber-400" /> Version History &amp; Audit Timeline
            </span>
            <div className="flex flex-col gap-2">
              {versions.length === 0 ? (
                <p className="text-xs text-white/30 py-4">No version snapshots logged yet.</p>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="min-w-0">
                      <span className="font-bold text-amber-300">Version v{v.version_number}</span>
                      <span className="text-white/40 ml-2">({new Date(v.created_at).toLocaleString()})</span>
                      <p className="text-white/70 text-[11px] mt-0.5">{v.change_summary}</p>
                    </div>
                    <button
                      onClick={() => handleRollback(v.id)}
                      disabled={saving}
                      className="shrink-0 px-3 py-2 sm:py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] flex items-center justify-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Restore State
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProductEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          <span className="text-xs">Loading Editor…</span>
        </div>
      }
    >
      <ProductEditorContent />
    </Suspense>
  );
}
