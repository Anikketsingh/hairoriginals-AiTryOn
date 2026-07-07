"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Camera, RefreshCw, X, Check, AlertTriangle, Sparkles } from "lucide-react";
import { validatePortraitPhoto, type ValidationResult } from "@/lib/validation";
import type { UploadedImage } from "@/lib/types";

interface CameraCaptureProps {
  onCapture: (image: UploadedImage) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [deviceOS, setDeviceOS] = useState<"ios" | "android" | "other">("other");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setDeviceOS("ios");
    } else if (/android/.test(ua)) {
      setDeviceOS("android");
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "Camera access is only available over secure connections (HTTPS or localhost). To test on mobile, please refer to the SSL / Local IP bypass settings below."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setError(null);
    } catch (err) {
      console.error("[CameraCapture] Access error:", err);
      setError(err instanceof Error ? err.message : "Unable to access camera. Please check browser permissions.");
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera]);

  const handleTakeSnap = useCallback(async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Flip horizontally if front camera for natural mirror feel
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedUrl(dataUrl);

    // Stop stream during review
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Run validation pipeline
    const valResult = await validatePortraitPhoto(dataUrl);
    setValidation(valResult);
  }, [facingMode]);

  const handleConfirmSnap = useCallback(async () => {
    if (!capturedUrl) return;
    const res = await fetch(capturedUrl);
    const blob = await res.blob();
    const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    const base64 = capturedUrl.split(",")[1];

    onCapture({
      file,
      dataUrl: capturedUrl,
      base64,
      mimeType: "image/jpeg",
    });
    onClose();
  }, [capturedUrl, onCapture, onClose]);

  const handleRetake = useCallback(() => {
    setCapturedUrl(null);
    setValidation(null);
    startCamera();
  }, [startCamera]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center animate-overlay-in"
    >
      <div className="relative flex w-full max-w-lg flex-col gap-5 rounded-t-[var(--radius-2xl)] bg-surface p-5 pb-safe shadow-[var(--shadow-pop)] animate-slide-up sm:rounded-[var(--radius-xl)] sm:animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Camera className="h-5 w-5 text-brand" />
            <h2 className="text-base font-bold tracking-tight text-ink">
              {capturedUrl ? "Looking good?" : "Take a selfie"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close camera"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:bg-surface-sunken active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Viewfinder or Review Area */}
        <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-line bg-neutral-900">
          {error ? (
            <div className="flex flex-col items-center gap-4 p-5 text-center text-sm text-white/90">
              <div className="flex flex-col items-center gap-1">
                <AlertTriangle className="h-9 w-9 text-warn" />
                <h3 className="text-sm font-bold text-white mt-1">Camera Access Blocked</h3>
                <p className="text-[11px] text-white/60">We need camera permissions to take a selfie for the virtual try-on.</p>
              </div>
              <div className="w-full rounded-xl bg-white/[0.04] border border-white/10 p-3.5 text-left text-xs leading-relaxed space-y-2">
                {deviceOS === "ios" ? (
                  <>
                    <p className="font-bold text-amber-400">How to enable on iPhone/iPad:</p>
                    <ol className="list-decimal pl-4 space-y-1 text-white/85">
                      <li>Tap the <span className="font-semibold text-white">"aA"</span> icon (left side of browser address bar).</li>
                      <li>Select <span className="font-semibold text-white">"Website Settings"</span>.</li>
                      <li>Change Camera permission to <span className="font-semibold text-emerald-400">"Allow"</span>.</li>
                      <li>Refresh the page to try again!</li>
                    </ol>
                  </>
                ) : deviceOS === "android" ? (
                  <>
                    <p className="font-bold text-amber-400">How to enable on Android:</p>
                    <ol className="list-decimal pl-4 space-y-1 text-white/85">
                      <li>Tap the <span className="font-semibold text-white">lock icon</span> or three-dots menu in the address bar.</li>
                      <li>Go to <span className="font-semibold text-white">"Site settings"</span>.</li>
                      <li>Change Camera permission to <span className="font-semibold text-emerald-400">"Allow"</span>.</li>
                      <li>Refresh the page to try again!</li>
                    </ol>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-amber-400">How to enable permissions:</p>
                    <ol className="list-decimal pl-4 space-y-1 text-white/85">
                      <li>Click the <span className="font-semibold text-white">lock icon</span> in the browser's address bar.</li>
                      <li>Allow <span className="font-semibold text-white">Camera</span> access.</li>
                      <li>Refresh the page to try again.</li>
                    </ol>
                  </>
                )}
              </div>
            </div>
          ) : capturedUrl ? (
            <img src={capturedUrl} alt="Captured portrait" className="h-full w-full object-cover" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
              />
              {/* Oval face-centering guide */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="flex h-72 w-56 items-center justify-center rounded-[50%] border-2 border-dashed border-white/80 shadow-[0_0_40px_rgba(0,0,0,0.35)]">
                  <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
                    Center your face here
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Validation feedback in review mode */}
        {capturedUrl && validation && validation.warnings.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-warn/25 bg-warn-soft p-3.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-warn">
              <Sparkles className="h-3.5 w-3.5" /> A quick tip
            </span>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-warn">
              {validation.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          {capturedUrl ? (
            <>
              <button
                onClick={handleRetake}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-surface text-sm font-semibold text-ink transition hover:bg-surface-sunken active:scale-[0.98]"
              >
                <RefreshCw className="h-4 w-4" /> Retake
              </button>
              <button
                onClick={handleConfirmSnap}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-gradient-to-r from-grad-1 via-grad-2 to-grad-3 text-sm font-bold text-white shadow-[var(--shadow-brand)] transition active:scale-[0.98]"
              >
                <Check className="h-4 w-4 stroke-[3]" /> Use this photo
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setFacingMode((prev) => (prev === "user" ? "environment" : "user"))}
                aria-label="Flip camera"
                title="Flip camera"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-line-strong bg-surface text-ink-soft transition hover:bg-surface-sunken active:scale-90"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={handleTakeSnap}
                disabled={!!error}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-gradient-to-r from-grad-1 via-grad-2 to-grad-3 text-sm font-bold text-white shadow-[var(--shadow-brand)] transition active:scale-[0.98] disabled:opacity-40"
              >
                <Camera className="h-4 w-4" /> Capture
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
