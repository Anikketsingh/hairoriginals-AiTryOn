"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw, AlertCircle, Info, ArrowRight, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import CameraCapture from "@/components/CameraCapture";
import { fileToUploadedImage } from "@/lib/image";
import { validatePortraitPhoto, type ValidationResult } from "@/lib/validation";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  type UploadedImage,
} from "@/lib/types";

interface PhotoStepProps {
  personImage?: UploadedImage;
  onSelect: (img: UploadedImage) => void;
  onContinue: () => void;
}

export default function PhotoStep({ personImage, onSelect, onContinue }: PhotoStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      try {
        const img = await fileToUploadedImage(file);
        if (img.dataUrl) setValidation(await validatePortraitPhoto(img.dataUrl));
        onSelect(img);
      } catch {
        setError("Something went wrong reading that photo. Please try again.");
      }
    },
    [onSelect]
  );

  const openFilePicker = () => inputRef.current?.click();

  const hasWarnings = !!validation && validation.warnings.length > 0;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pt-20 pb-32 animate-fade-in">
      <div className="mt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Add your photo</h1>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          A clear, front-facing selfie works best.
        </p>
      </div>

      {/* Preview or picker */}
      <div className="mt-6 flex-1">
        {personImage ? (
          <div className="flex flex-col gap-4">
            <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface-sunken shadow-[var(--shadow-card)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={personImage.dataUrl}
                alt="Your selected photo"
                className="aspect-[3/4] w-full object-cover"
              />
            </div>
            {/* Always-visible replace controls (no hover) */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" size="md" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={openFilePicker}>
                Replace
              </Button>
              <Button variant="secondary" size="md" leftIcon={<Camera className="h-4 w-4" />} onClick={() => setShowCamera(true)}>
                Retake
              </Button>
            </div>
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
              "flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border-2 border-dashed transition-all",
              dragOver ? "border-brand bg-brand-soft" : "border-line-strong bg-surface",
            ].join(" ")}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
              <ImagePlus className="h-8 w-8" />
            </div>
            <p className="text-sm font-semibold text-ink">Tap to add a photo</p>
            <p className="text-xs text-ink-faint">or drag one here</p>
          </div>
        )}

        {/* Big obvious source buttons */}
        {!personImage && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="solid" size="lg" leftIcon={<Camera className="h-5 w-5" />} onClick={() => setShowCamera(true)}>
              Take a selfie
            </Button>
            <Button variant="secondary" size="lg" leftIcon={<ImagePlus className="h-5 w-5" />} onClick={openFilePicker}>
              Choose photo
            </Button>
          </div>
        )}

        {/* Non-blocking quality tip */}
        {hasWarnings && (
          <div className="mt-5 flex flex-col gap-2 rounded-[var(--radius-md)] border border-warn/25 bg-warn-soft p-4">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-warn">
              <Info className="h-4 w-4" /> A quick tip for a better result
            </span>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-warn">
              {validation!.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="text-xs text-ink-soft">You can use this photo anyway, or retake it.</p>
          </div>
        )}

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-[var(--radius-md)] border border-danger/25 bg-danger-soft px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
      </div>

      {/* Sticky continue CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/90 px-5 pt-3 pb-safe backdrop-blur-md">
        <div className="mx-auto max-w-md pb-3">
          <Button
            size="lg"
            fullWidth
            disabled={!personImage}
            onClick={onContinue}
            rightIcon={<ArrowRight className="h-5 w-5" />}
            leftIcon={personImage ? <Check className="h-5 w-5" /> : undefined}
          >
            {personImage ? "Continue" : "Add a photo to continue"}
          </Button>
        </div>
      </div>

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
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
