"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw, AlertCircle, Info, ArrowRight, Check, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import StickyActionBar from "@/components/ui/StickyActionBar";
import CameraCapture from "@/components/CameraCapture";
import { compressForUpload, fileToUploadedImage } from "@/lib/image";
import { validatePortraitPhoto, type ValidationResult } from "@/lib/validation";
import { trackAnalyticsEvent } from "@/lib/analytics-client";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  type UploadedImage,
} from "@/lib/types";

interface PhotoStepProps {
  personImage?: UploadedImage;
  sessionToken?: string | null;
  onSelect: (img: UploadedImage) => void;
  onContinue: () => void;
}

export default function PhotoStep({ personImage, sessionToken, onSelect, onContinue }: PhotoStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const process = useCallback(
    async (file: File) => {
      setError(null);
      setValidation(null);
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
        setError("That file isn't a photo. Please choose a PNG, JPEG, or WEBP image.");
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`That photo is too big. Please keep it under ${MAX_FILE_SIZE_MB}MB.`);
        return;
      }
      setPreparing(true);
      try {
        // Shrunk *before* it is read into base64, so a 20MB photo is neither
        // held in memory twice nor posted at a size the request-body cap will
        // drop at the edge (see compressForUpload).
        const upload = await compressForUpload(file);
        const img = await fileToUploadedImage(upload);
        if (img.dataUrl) setValidation(await validatePortraitPhoto(img.dataUrl));
        onSelect(img);
        trackAnalyticsEvent("photo_added", {}, sessionToken);
      } catch {
        setError("Something went wrong reading that photo. Please try again.");
      } finally {
        setPreparing(false);
      }
    },
    [onSelect, sessionToken]
  );

  const openFilePicker = () => {
    if (!preparing) inputRef.current?.click();
  };

  const hasWarnings = !!validation && validation.warnings.length > 0;

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden px-5 pt-[calc(env(safe-area-inset-top)+4.25rem)] pb-[calc(env(safe-area-inset-bottom)+6rem)] animate-fade-in">
      <div className="shrink-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Add your photo</h1>
        <p className="mt-1 text-[14px] text-ink-soft">A clear, front-facing selfie works best.</p>
      </div>

      {/* Preview or picker — flexes to fill the screen so the source buttons
          below always stay above the fold (no scrolling on phones). */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
        {personImage ? (
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface-sunken shadow-[var(--shadow-card)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={personImage.dataUrl}
              alt="Your selected photo"
              className="h-full w-full object-cover"
            />
            {preparing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/80 backdrop-blur-sm">
                <Loader2 className="h-7 w-7 animate-spin text-brand" />
                <p className="text-sm font-semibold text-ink">Getting your photo ready…</p>
              </div>
            )}
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label="Add a photo"
            onClick={openFilePicker}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openFilePicker()}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) process(f);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            className={[
              "flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border-2 border-dashed transition-all",
              dragOver ? "border-brand bg-brand-soft" : "border-line-strong bg-surface",
            ].join(" ")}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
              {preparing ? <Loader2 className="h-8 w-8 animate-spin" /> : <ImagePlus className="h-8 w-8" />}
            </div>
            <p className="text-sm font-semibold text-ink">
              {preparing ? "Getting your photo ready…" : "Tap to add a photo"}
            </p>
            <p className="text-xs text-ink-faint">{preparing ? "This takes a moment" : "or drag one here"}</p>
          </div>
        )}

        {/* Non-blocking quality tip — compresses the preview, never scrolls */}
        {hasWarnings && (
          <div className="flex shrink-0 flex-col gap-1.5 rounded-[var(--radius-md)] border border-warn/25 bg-warn-soft p-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-warn">
              <Info className="h-4 w-4" /> A quick tip for a better result
            </span>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-warn">
              {validation!.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="flex shrink-0 items-start gap-2 rounded-[var(--radius-md)] border border-danger/25 bg-danger-soft px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
      </div>

      {/* Source / replace controls — pinned above the CTA, always on screen */}
      <div className="mt-3 shrink-0">
        {personImage ? (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="md" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={openFilePicker}>
              Replace
            </Button>
            <Button variant="secondary" size="md" leftIcon={<Camera className="h-4 w-4" />} onClick={() => setShowCamera(true)}>
              Retake
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <Button variant="solid" size="lg" fullWidth leftIcon={<Camera className="h-5 w-5" />} onClick={() => setShowCamera(true)}>
              Take a selfie
            </Button>
            <Button variant="secondary" size="lg" fullWidth leftIcon={<ImagePlus className="h-5 w-5" />} onClick={openFilePicker}>
              Choose photo
            </Button>
          </div>
        )}
      </div>

      {/* Sticky continue CTA */}
      <StickyActionBar>
        <div className="mx-auto flex max-w-md flex-col gap-2.5 pb-3">
          <Button
            size="lg"
            fullWidth
            disabled={!personImage}
            onClick={onContinue}
            rightIcon={<ArrowRight className="h-5 w-5" />}
            leftIcon={personImage ? <Check className="h-5 w-5" /> : undefined}
          >
            {!personImage ? "Add a photo to continue" : "Continue"}
          </Button>
        </div>
      </StickyActionBar>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) process(f);
          e.target.value = "";
        }}
        className="sr-only"
        aria-hidden="true"
      />

      {showCamera && (
        <CameraCapture
          onCapture={(img) => {
            setValidation(null);
            setError(null);
            onSelect(img);
            trackAnalyticsEvent("photo_added", { source: "camera" }, sessionToken);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
