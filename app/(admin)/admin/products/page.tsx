"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Package, Plus, Search, Filter, Copy, Trash2, Edit3, History, CheckCircle2, Archive, Loader2, Sparkles, AlertCircle } from "lucide-react";
import type { Product, Category } from "@/lib/types";
import { formatMoney } from "@/lib/format";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchCatalogData = useCallback(async () => {
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch(`/api/admin/products?gender=${genderFilter}&status=${statusFilter}`),
        fetch("/api/categories"),
      ]);
      if (prodRes.ok) setProducts(await prodRes.ok ? await prodRes.json() : []);
      if (catRes.ok) setCategories(await catRes.json());
    } catch (err) {
      console.error("Failed to load products:", err);
    } finally {
      setLoading(false);
    }
  }, [genderFilter, statusFilter]);

  useEffect(() => {
    fetchCatalogData();
  }, [fetchCatalogData]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredProducts.map((p) => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkAction = async (action: "publish" | "archive" | "delete") => {
    if (selectedIds.length === 0) return;
    if (action === "delete" && !confirm(`Are you sure you want to delete ${selectedIds.length} products?`)) return;

    setProcessing(true);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, action }),
      });
      if (res.ok) {
        setSelectedIds([]);
        await fetchCatalogData();
      }
    } catch (err) {
      console.error("Bulk action failed:", err);
    } finally {
      setProcessing(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    setProcessing(true);
    try {
      const res = await fetch("/api/admin/products/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) await fetchCatalogData();
    } catch (err) {
      console.error("Duplicate failed:", err);
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
      if (res.ok) await fetchCatalogData();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setProcessing(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesQuery = searchQuery
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;
    return matchesQuery;
  });

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      {/* Header & New Product CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Product Catalog Management</h1>
          <p className="text-xs text-white/50 mt-1">Complete control over HairOriginals products, AI reference assets, pricing, and display settings.</p>
        </div>
        <Link
          href="/admin/products/editor"
          className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-white font-bold text-xs shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4 stroke-[3]" /> Add New Product
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-3 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 md:gap-4">
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3 flex-1 min-w-0">
          {/* Search Box */}
          <div className="relative w-full md:w-auto md:min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 md:py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          {/* Filter pill groups — one swipeable row on phones */}
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 md:mx-0 md:px-0 md:overflow-visible">
            {/* Gender Filter Tabs */}
            <div className="flex shrink-0 items-center rounded-xl bg-white/5 border border-white/10 p-1">
              {["all", "women", "men"].map((g) => (
                <button
                  key={g}
                  onClick={() => setGenderFilter(g)}
                  className={`px-3 py-1.5 md:py-1 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-all ${
                    genderFilter === g ? "bg-amber-400 text-black shadow-md" : "text-white/50 hover:text-white"
                  }`}
                >
                  {g === "women" ? "👩 Women" : g === "men" ? "👨 Men" : "All Genders"}
                </button>
              ))}
            </div>

            {/* Status Filter Tabs */}
            <div className="flex shrink-0 items-center rounded-xl bg-white/5 border border-white/10 p-1">
              {["all", "published", "draft", "archived"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 md:py-1 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-all ${
                    statusFilter === st ? "bg-white/15 text-white shadow-md" : "text-white/40 hover:text-white"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 animate-fade-in bg-amber-400/10 border border-amber-400/30 px-3 py-2 rounded-xl">
            <span className="text-xs font-bold text-amber-300 mr-1">{selectedIds.length} Selected:</span>
            <button
              onClick={() => handleBulkAction("publish")}
              disabled={processing}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/30"
            >
              Publish
            </button>
            <button
              onClick={() => handleBulkAction("archive")}
              disabled={processing}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs font-semibold hover:bg-white/20"
            >
              Archive
            </button>
            <button
              onClick={() => handleBulkAction("delete")}
              disabled={processing}
              className="px-2.5 py-1.5 rounded-lg bg-red-500/20 text-red-300 text-xs font-semibold hover:bg-red-500/30"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Products Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
          <span className="text-xs">Loading Catalog Workstation…</span>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-10 sm:p-16 text-center flex flex-col items-center gap-3">
          <Package className="w-10 h-10 text-white/20" />
          <p className="text-sm font-semibold text-white/60">No products found matching filters.</p>
        </div>
      ) : (
        <>
        {/* Phone layout — the desktop table's 7 columns can't survive a 390px
            viewport, so each product becomes a card with the same actions. */}
        <div className="md:hidden flex flex-col gap-3">
          <label className="flex items-center gap-2.5 px-1 text-xs font-semibold text-white/50">
            <input
              type="checkbox"
              checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
              onChange={handleSelectAll}
              className="h-4 w-4 rounded bg-white/10 border-white/20 accent-amber-400"
            />
            Select all ({filteredProducts.length})
          </label>

          {filteredProducts.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <div
                key={p.id}
                className={`rounded-2xl border p-3.5 flex flex-col gap-3 transition-colors ${
                  isSelected ? "bg-amber-400/5 border-amber-400/40" : "bg-white/[0.03] border-white/8"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectOne(p.id)}
                    aria-label={`Select ${p.name}`}
                    className="mt-1 h-4 w-4 shrink-0 rounded bg-white/10 border-white/20 accent-amber-400"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-14 h-14 shrink-0 rounded-xl object-cover bg-black/40 border border-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{p.name}</p>
                    <p className="text-[11px] text-white/40 truncate capitalize">
                      {p.gender || "women"} · {p.category?.name || "Uncategorized"}
                    </p>
                    <p className="text-[11px] text-white/30 font-mono truncate">SKU {p.sku || "N/A"}</p>
                    {p.prompt_override && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                        <Sparkles className="w-3 h-3" /> Custom Prompt
                      </span>
                    )}
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      p.status === "published"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : p.status === "draft"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-white/10 text-white/40"
                    }`}
                  >
                    {p.status || "published"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3">
                  <span className="text-sm font-bold text-emerald-400">
                    {formatMoney(p.selling_price || p.price || 0, p.currency ?? undefined)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/admin/products/editor?id=${p.id}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs font-semibold active:bg-white/15"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </Link>
                    <button
                      onClick={() => handleDuplicate(p.id)}
                      disabled={processing}
                      aria-label={`Duplicate ${p.name}`}
                      className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-white/60 active:bg-white/15 disabled:opacity-40"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={processing}
                      aria-label={`Delete ${p.name}`}
                      className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-white/60 active:bg-red-500/15 active:text-rose-400 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden md:block rounded-2xl bg-white/[0.03] border border-white/8 overflow-hidden">
          <table className="w-full text-left text-xs text-white/70">
            <thead className="bg-white/5 text-white/40 uppercase font-mono text-[10px] tracking-wider border-b border-white/8">
              <tr>
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={handleSelectAll}
                    className="rounded bg-white/10 border-white/20"
                  />
                </th>
                <th className="p-4">Product</th>
                <th className="p-4">Gender &amp; Category</th>
                <th className="p-4">SKU</th>
                <th className="p-4">Selling Price</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredProducts.map((p) => {
                const isSelected = selectedIds.includes(p.id);
                return (
                  <tr key={p.id} className={`hover:bg-white/[0.02] transition-colors ${isSelected ? "bg-amber-400/5" : ""}`}>
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectOne(p.id)}
                        className="rounded bg-white/10 border-white/20"
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover bg-black/40 border border-white/10" />
                        <div>
                          <span className="font-bold text-white block">{p.name}</span>
                          {p.prompt_override && (
                            <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> Custom Prompt Active
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="capitalize font-semibold text-white">{p.gender || "women"}</span>
                        <span className="text-[11px] text-white/40">{p.category?.name || "Uncategorized"}</span>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-white/50">{p.sku || "N/A"}</td>
                    <td className="p-4 font-bold text-emerald-400">{formatMoney(p.selling_price || p.price || 0, p.currency ?? undefined)}</td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          p.status === "published"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : p.status === "draft"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-white/10 text-white/40"
                        }`}
                      >
                        {p.status || "published"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/products/editor?id=${p.id}`}
                          className="p-1.5 rounded-lg text-white/50 hover:text-amber-400 hover:bg-white/10"
                          title="Edit Product"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDuplicate(p.id)}
                          disabled={processing}
                          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
                          title="Duplicate Product"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={processing}
                          className="p-1.5 rounded-lg text-white/50 hover:text-rose-400 hover:bg-white/10"
                          title="Delete Product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
