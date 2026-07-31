"use client";

import { useEffect, useState } from "react";
import { Palette, Plus, Trash2, Save, Loader2, CheckCircle2, AlertTriangle, Layers } from "lucide-react";

interface CustomizationAttribute {
  id: string;
  key: string;
  label: string;
  description: string | null;
  ui_type: "swatch" | "chip" | "thumbnail";
  display_order: number;
  is_active: boolean;
  customization_options?: { count: number }[];
}

interface CustomizationOption {
  id: string;
  attribute_id: string;
  value: string;
  label: string;
  swatch_hex: string | null;
  image_url: string | null;
  prompt_fragment: string;
  display_order: number;
  is_active: boolean;
}

const UI_TYPES: CustomizationAttribute["ui_type"][] = ["swatch", "chip", "thumbnail"];

export default function CustomizationLibraryPage() {
  const [attributes, setAttributes] = useState<CustomizationAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [options, setOptions] = useState<CustomizationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [savingAttrId, setSavingAttrId] = useState<string | null>(null);
  const [savedAttrId, setSavedAttrId] = useState<string | null>(null);
  const [savingOptId, setSavingOptId] = useState<string | null>(null);
  const [savedOptId, setSavedOptId] = useState<string | null>(null);

  const [newAttrKey, setNewAttrKey] = useState("");
  const [newAttrLabel, setNewAttrLabel] = useState("");
  const [newAttrUiType, setNewAttrUiType] = useState<CustomizationAttribute["ui_type"]>("chip");
  const [creatingAttr, setCreatingAttr] = useState(false);

  const [newOptValue, setNewOptValue] = useState("");
  const [newOptLabel, setNewOptLabel] = useState("");
  const [newOptSwatch, setNewOptSwatch] = useState("#8B5E3C");
  const [newOptFragment, setNewOptFragment] = useState("");
  const [creatingOpt, setCreatingOpt] = useState(false);

  const selected = attributes.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    async function loadAttributes() {
      try {
        const res = await fetch("/api/admin/customization/attributes");
        if (res.ok) {
          const data: CustomizationAttribute[] = await res.json();
          setAttributes(data);
          setSelectedId((prev) => prev ?? data[0]?.id ?? null);
        }
      } catch (err) {
        console.error("Failed to load attributes:", err);
      } finally {
        setLoadingAttributes(false);
      }
    }
    loadAttributes();
  }, []);

  useEffect(() => {
    async function loadOptions() {
      if (!selectedId) {
        setOptions([]);
        return;
      }
      setLoadingOptions(true);
      try {
        const res = await fetch(`/api/admin/customization/options?attribute_id=${selectedId}`);
        if (res.ok) setOptions(await res.json());
      } catch (err) {
        console.error("Failed to load options:", err);
      } finally {
        setLoadingOptions(false);
      }
    }
    loadOptions();
  }, [selectedId]);

  // ── Attributes ──────────────────────────────────────────────

  const updateAttrField = <K extends keyof CustomizationAttribute>(id: string, field: K, value: CustomizationAttribute[K]) => {
    setAttributes((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };

  const handleSaveAttribute = async (attr: CustomizationAttribute) => {
    setSavingAttrId(attr.id);
    try {
      const res = await fetch(`/api/admin/customization/attributes/${attr.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: attr.label,
          description: attr.description,
          ui_type: attr.ui_type,
          display_order: attr.display_order,
          is_active: attr.is_active,
        }),
      });
      if (res.ok) {
        setSavedAttrId(attr.id);
        setTimeout(() => setSavedAttrId(null), 2000);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save attribute.");
      }
    } catch (err) {
      console.error("Save attribute error:", err);
    } finally {
      setSavingAttrId(null);
    }
  };

  const handleCreateAttribute = async () => {
    if (!newAttrKey.trim() || !newAttrLabel.trim()) {
      alert("Key and label are required.");
      return;
    }
    setCreatingAttr(true);
    try {
      const res = await fetch("/api/admin/customization/attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newAttrKey.trim(),
          label: newAttrLabel.trim(),
          ui_type: newAttrUiType,
          display_order: attributes.length,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAttributes((prev) => [...prev, data]);
        setSelectedId(data.id);
        setNewAttrKey("");
        setNewAttrLabel("");
        setNewAttrUiType("chip");
      } else {
        alert(data.error || "Failed to create attribute.");
      }
    } catch (err) {
      console.error("Create attribute error:", err);
    } finally {
      setCreatingAttr(false);
    }
  };

  const handleDeleteAttribute = async (attr: CustomizationAttribute) => {
    if (!confirm(`Delete "${attr.label}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/customization/attributes/${attr.id}`, { method: "DELETE" });
    if (res.status === 409) {
      const data = await res.json();
      if (!confirm(`${data.error}\n\nDelete anyway, along with all of its options?`)) return;
      const cascadeRes = await fetch(`/api/admin/customization/attributes/${attr.id}?cascade=true`, { method: "DELETE" });
      if (!cascadeRes.ok) {
        alert("Failed to delete attribute.");
        return;
      }
    } else if (!res.ok) {
      alert("Failed to delete attribute.");
      return;
    }
    setAttributes((prev) => prev.filter((a) => a.id !== attr.id));
    if (selectedId === attr.id) setSelectedId(null);
  };

  // ── Options ─────────────────────────────────────────────────

  const updateOptField = <K extends keyof CustomizationOption>(id: string, field: K, value: CustomizationOption[K]) => {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
  };

  const handleSaveOption = async (opt: CustomizationOption) => {
    setSavingOptId(opt.id);
    try {
      const res = await fetch(`/api/admin/customization/options/${opt.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: opt.label,
          swatch_hex: opt.swatch_hex,
          image_url: opt.image_url,
          prompt_fragment: opt.prompt_fragment,
          display_order: opt.display_order,
          is_active: opt.is_active,
        }),
      });
      if (res.ok) {
        setSavedOptId(opt.id);
        setTimeout(() => setSavedOptId(null), 2000);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save option.");
      }
    } catch (err) {
      console.error("Save option error:", err);
    } finally {
      setSavingOptId(null);
    }
  };

  const handleCreateOption = async () => {
    if (!selectedId) return;
    if (!newOptValue.trim() || !newOptLabel.trim() || !newOptFragment.trim()) {
      alert("Value, label, and prompt fragment are required.");
      return;
    }
    setCreatingOpt(true);
    try {
      const res = await fetch("/api/admin/customization/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attribute_id: selectedId,
          value: newOptValue.trim(),
          label: newOptLabel.trim(),
          swatch_hex: selected?.ui_type === "swatch" ? newOptSwatch : undefined,
          prompt_fragment: newOptFragment.trim(),
          display_order: options.length,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setOptions((prev) => [...prev, data]);
        setNewOptValue("");
        setNewOptLabel("");
        setNewOptFragment("");
      } else {
        alert(data.error || "Failed to create option.");
      }
    } catch (err) {
      console.error("Create option error:", err);
    } finally {
      setCreatingOpt(false);
    }
  };

  const handleDeleteOption = async (opt: CustomizationOption) => {
    if (!confirm(`Delete "${opt.label}"? Any product currently offering it will stop offering it.`)) return;
    const res = await fetch(`/api/admin/customization/options/${opt.id}`, { method: "DELETE" });
    if (res.ok) setOptions((prev) => prev.filter((o) => o.id !== opt.id));
    else alert("Failed to delete option.");
  };

  if (loadingAttributes) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-white/40 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        <span className="text-xs">Loading Customization Library…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8 max-w-6xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Hair Customization Library</h1>
        <p className="text-xs text-white/50 mt-1">
          Define attributes (Hair Colour, Hair Length, …) and their options once here, then choose which options each
          product offers on its Customization tab in the Product Editor.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 sm:gap-6">
        {/* Attributes column */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-3 sm:p-4 flex flex-col gap-3 h-fit">
          <div className="flex items-center gap-2 px-1 pb-2 border-b border-white/8">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Attributes</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {attributes.map((attr) => (
              <button
                key={attr.id}
                onClick={() => setSelectedId(attr.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                  selectedId === attr.id
                    ? "bg-amber-400/15 border border-amber-400/30 text-amber-200"
                    : "border border-transparent text-white/70 hover:bg-white/5"
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">{attr.label}</span>
                  <span className="text-[10px] text-white/30 font-mono">{attr.key}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!attr.is_active && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/40">off</span>
                  )}
                  <span className="text-[10px] text-white/30">{attr.customization_options?.[0]?.count ?? 0}</span>
                </div>
              </button>
            ))}
            {attributes.length === 0 && <p className="text-[11px] text-white/30 py-2 px-1">No attributes yet.</p>}
          </div>

          <div className="pt-3 mt-1 border-t border-white/8 flex flex-col gap-2">
            <input
              type="text"
              placeholder="key (e.g. hair_density)"
              value={newAttrKey}
              onChange={(e) => setNewAttrKey(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-[11px] font-mono focus:outline-none focus:border-amber-400/50"
            />
            <input
              type="text"
              placeholder="Label (e.g. Hair Density)"
              value={newAttrLabel}
              onChange={(e) => setNewAttrLabel(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-[11px] focus:outline-none focus:border-amber-400/50"
            />
            <select
              value={newAttrUiType}
              onChange={(e) => setNewAttrUiType(e.target.value as CustomizationAttribute["ui_type"])}
              className="px-2.5 py-1.5 rounded-lg bg-black border border-white/10 text-white text-[11px] focus:outline-none"
            >
              {UI_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              onClick={handleCreateAttribute}
              disabled={creatingAttr}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white text-[11px] font-semibold transition-all disabled:opacity-40"
            >
              {creatingAttr ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Add Attribute
            </button>
          </div>
        </div>

        {/* Options column */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4 sm:p-6 flex flex-col gap-6 min-w-0">
          {!selected ? (
            <p className="text-xs text-white/30 py-8 text-center">Select or create an attribute to manage its options.</p>
          ) : (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/8">
                <div className="flex items-center gap-2 min-w-0">
                  <Palette className="w-4 h-4 shrink-0 text-amber-400" />
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <input
                      type="text"
                      value={selected.label}
                      onChange={(e) => updateAttrField(selected.id, "label", e.target.value)}
                      className="bg-transparent text-sm font-bold text-white focus:outline-none border-b border-transparent focus:border-amber-400/50"
                    />
                    <textarea
                      rows={1}
                      placeholder="Description shown to admins only (optional)"
                      value={selected.description ?? ""}
                      onChange={(e) => updateAttrField(selected.id, "description", e.target.value)}
                      className="bg-transparent text-[11px] text-white/40 focus:outline-none resize-none"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:shrink-0">
                  <select
                    value={selected.ui_type}
                    onChange={(e) => updateAttrField(selected.id, "ui_type", e.target.value as CustomizationAttribute["ui_type"])}
                    aria-label="Attribute UI type"
                    className="px-2.5 py-2 sm:py-1.5 rounded-lg bg-black border border-white/10 text-white text-[11px] focus:outline-none"
                  >
                    {UI_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-[11px] text-white/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.is_active}
                      onChange={(e) => updateAttrField(selected.id, "is_active", e.target.checked)}
                      className="rounded bg-white/10"
                    />
                    Active
                  </label>
                  {savedAttrId === selected.id && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  <button
                    onClick={() => handleSaveAttribute(selected)}
                    disabled={savingAttrId === selected.id}
                    className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white text-[11px] font-semibold transition-all disabled:opacity-40"
                  >
                    {savingAttrId === selected.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                  <button
                    onClick={() => handleDeleteAttribute(selected)}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-red-400 transition-colors"
                    aria-label="Delete attribute"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {loadingOptions ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {options.length === 0 && (
                    <p className="text-xs text-white/30 py-2">No options yet. Add the first one below.</p>
                  )}
                  {options.map((opt) => (
                    <div key={opt.id} className="p-3.5 sm:p-4 rounded-xl bg-white/[0.01] border border-white/5 flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {selected.ui_type === "swatch" && (
                            <input
                              type="color"
                              value={opt.swatch_hex ?? "#000000"}
                              onChange={(e) => updateOptField(opt.id, "swatch_hex", e.target.value)}
                              aria-label={`Swatch colour for ${opt.label}`}
                              className="w-7 h-7 shrink-0 rounded-full border border-white/20 bg-transparent cursor-pointer"
                            />
                          )}
                          <input
                            type="text"
                            value={opt.label}
                            onChange={(e) => updateOptField(opt.id, "label", e.target.value)}
                            aria-label="Option label"
                            className="min-w-0 flex-1 sm:flex-none bg-transparent text-xs font-bold text-white focus:outline-none border-b border-transparent focus:border-amber-400/50"
                          />
                          <span className="shrink-0 text-[10px] text-white/30 font-mono truncate">{opt.value}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="flex items-center gap-1.5 text-[10px] text-white/50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={opt.is_active}
                              onChange={(e) => updateOptField(opt.id, "is_active", e.target.checked)}
                              className="rounded bg-white/10"
                            />
                            Active
                          </label>
                          {savedOptId === opt.id && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                          <button
                            onClick={() => handleSaveOption(opt)}
                            disabled={savingOptId === opt.id}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors disabled:opacity-40"
                            aria-label="Save option"
                          >
                            {savingOptId === opt.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDeleteOption(opt)}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-red-400 transition-colors"
                            aria-label="Delete option"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={2}
                        value={opt.prompt_fragment}
                        onChange={(e) => updateOptField(opt.id, "prompt_fragment", e.target.value)}
                        maxLength={500}
                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400/50"
                      />
                      <p className="text-[10px] text-white/30 font-mono">
                        Preview: <span className="text-white/50">- {selected.label}: {opt.prompt_fragment}</span>
                      </p>
                    </div>
                  ))}

                  {/* Add option */}
                  <div className="p-3.5 sm:p-4 rounded-xl border border-dashed border-white/10 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-white/50 uppercase tracking-wider">
                      <Plus className="w-3.5 h-3.5" /> Add Option
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="value (e.g. jet_black)"
                        value={newOptValue}
                        onChange={(e) => setNewOptValue(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400/50"
                      />
                      <div className="flex items-center gap-2">
                        {selected.ui_type === "swatch" && (
                          <input
                            type="color"
                            value={newOptSwatch}
                            onChange={(e) => setNewOptSwatch(e.target.value)}
                            className="w-8 h-8 rounded-full border border-white/20 bg-transparent cursor-pointer shrink-0"
                          />
                        )}
                        <input
                          type="text"
                          placeholder="Label (e.g. Jet Black)"
                          value={newOptLabel}
                          onChange={(e) => setNewOptLabel(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400/50"
                        />
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Prompt fragment sent to Gemini, e.g. 'Render the hair in a deep, glossy jet black.'"
                      value={newOptFragment}
                      onChange={(e) => setNewOptFragment(e.target.value)}
                      maxLength={500}
                      className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400/50"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleCreateOption}
                        disabled={creatingOpt}
                        className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-white font-bold text-xs shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        {creatingOpt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Add Option
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-400/5 border border-amber-400/15 text-amber-200/80 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Adding or editing options here doesn&apos;t attach them to any product. Go to a product&apos;s editor →
                  Customization tab to tick which of these options that product offers.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
