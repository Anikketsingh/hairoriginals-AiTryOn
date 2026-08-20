"use client";

/**
 * components/admin/AdminImageUploader.tsx
 *
 * One admin image field: drag-and-drop, a file picker, or a pasted URL, all
 * writing the same string back through `onChange`. Uploads go to
 * POST /api/admin/upload (the public `products` bucket) and the returned
 * public URL becomes the value.
 *
 * Extracted from the product editor, which was its only caller until the
 * home trial banners needed the same control on the settings page.
 */

import { useRef, useState } from "react";
import { Loader2, Trash2, UploadCloud } from "lucide-react";

interface AdminImageUploaderProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}

export default function AdminImageUploader({ label, value, onChange, placeholder = "Image URL..." }: AdminImageUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        onChange(data.url);
      } else {
        const data = await res.json();
        alert(data.error || "Upload failed");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("An error occurred during upload.");
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-white/70">{label}</label>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative flex flex-col md:flex-row items-start md:items-center gap-4 p-3 sm:p-4 rounded-xl border-2 border-dashed transition-all ${
          dragOver
            ? "border-amber-400/60 bg-amber-400/5 scale-[1.01]"
            : "border-white/10 bg-white/[0.02] hover:border-white/20"
        }`}
      >
        {/* Preview image */}
        {value ? (
          <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-black/40 border border-white/10 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Preview" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="w-20 h-20 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-white/20 shrink-0">
            <UploadCloud className="w-8 h-8" />
          </div>
        )}

        {/* Drag and Drop instructions or loader */}
        <div className="flex-1 flex flex-col gap-2 w-full">
          {uploading ? (
            <div className="flex items-center gap-2 text-xs text-amber-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Uploading to server...</span>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400/50"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 md:py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all whitespace-nowrap"
              >
                Choose File
              </button>
            </div>
          )}
          <p className="text-[10px] text-white/30">
            Drag &amp; drop image here, paste a URL, or click &quot;Choose File&quot; to upload
          </p>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileSelect}
          accept="image/*"
          className="hidden"
        />
      </div>
    </div>
  );
}
