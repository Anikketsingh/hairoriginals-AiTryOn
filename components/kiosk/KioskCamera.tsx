"use client";

/**
 * Standee camera: a live mirror in the TOP and MIDDLE of the screen, so the
 * customer looks at themselves at roughly the camera's eye level, with the
 * controls below. Capture runs a 3-2-1 countdown (they're standing back
 * from the screen, not holding a phone), then a review with Retake / Use.
 *
 * The saved photo is cropped to exactly the 3:4 frame the customer saw, and
 * mirrored like the preview, so "what you saw" is "what we try on".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, RefreshCw, Sparkles, VideoOff } from "lucide-react";
import { validatePortraitPhoto } from "@/lib/validation";
import type { UploadedImage } from "@/lib/types";
import { GlassButton, KioskLogo } from "@/components/kiosk/ui";

const FRAME_ASPECT = 3 / 4; // width / height of the viewfinder
const COUNTDOWN_FROM = 3;

type Phase = "starting" | "live" | "countdown" | "review" | "error";

export default function KioskCamera({
  onCapture,
  onBack,
}: {
  onCapture: (image: UploadedImage) => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [count, setCount] = useState(COUNTDOWN_FROM);
  const [flash, setFlash] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [insecure, setInsecure] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async () => {
    stopStream();
    // Browsers only expose the camera on https:// or localhost; on a plain
    // http LAN address mediaDevices is simply undefined.
    if (!navigator.mediaDevices?.getUserMedia) {
      setInsecure(true);
      setPhase("error");
      return;
    }
    try {
      // Standee webcams are usually landscape; ask for the most pixels and
      // crop to portrait ourselves.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setPhase("live");
    } catch (err) {
      console.error("[KioskCamera] camera error:", err);
      setPhase("error");
    }
  }, [stopStream]);

  useEffect(() => {
    const t = setTimeout(startStream, 0);
    return () => {
      clearTimeout(t);
      stopStream();
    };
  }, [startStream, stopStream]);

  const snap = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Centre-crop the frame to the viewfinder's 3:4, matching object-cover.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    let sw = vw;
    let sh = vh;
    if (vw / vh > FRAME_ASPECT) sw = Math.round(vh * FRAME_ASPECT);
    else sh = Math.round(vw / FRAME_ASPECT);
    const sx = Math.round((vw - sw) / 2);
    const sy = Math.round((vh - sh) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(sw, 0);
    ctx.scale(-1, 1); // mirror, like the preview
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
    setCaptured(dataUrl);
    setPhase("review");
    stopStream();
    const result = await validatePortraitPhoto(dataUrl);
    setWarnings(result.warnings);
  }, [stopStream]);

  // 3-2-1 countdown, then snap. Timers live in a ref so leaving the screen
  // mid-countdown (Back, idle reset) can't fire a snap into a dead camera.
  const countdownTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => countdownTimers.current.forEach(clearTimeout), []);

  const startCountdown = () => {
    setCount(COUNTDOWN_FROM);
    setPhase("countdown");
    countdownTimers.current = [
      ...Array.from({ length: COUNTDOWN_FROM - 1 }, (_, i) =>
        setTimeout(() => setCount(COUNTDOWN_FROM - 1 - i), (i + 1) * 1000)
      ),
      setTimeout(() => void snap(), COUNTDOWN_FROM * 1000),
    ];
  };

  const retake = () => {
    setCaptured(null);
    setWarnings([]);
    setPhase("starting");
    void startStream();
  };

  const confirmPhoto = async () => {
    if (!captured) return;
    const blob = await (await fetch(captured)).blob();
    onCapture({
      file: new File([blob], `kiosk-capture-${Date.now()}.jpg`, { type: "image/jpeg" }),
      dataUrl: captured,
      base64: captured.split(",")[1],
      mimeType: "image/jpeg",
    });
  };

  return (
    <div className="relative flex h-full flex-col items-center bg-[#141012] text-white">
      {/* Header */}
      <div className="flex w-full items-center justify-between px-12 pt-[3.5vh]">
        <button
          type="button"
          onClick={onBack}
          className="flex h-[88px] w-[88px] items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-xl active:scale-95"
          aria-label="Back"
        >
          <ArrowLeft className="h-10 w-10" />
        </button>
        <KioskLogo light className="h-12" />
        <span className="w-[88px]" />
      </div>

      <p className="mt-[2vh] text-[38px] font-bold tracking-tight">
        {phase === "review" ? "Looking good?" : "Look into the camera"}
      </p>

      {/* Viewfinder — top/middle of the screen, at eye level */}
      <div
        className="relative mt-[2.5vh] w-[84vw] overflow-hidden rounded-[56px] border border-white/15 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
        style={{ aspectRatio: `${FRAME_ASPECT}` }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full scale-x-[-1] object-cover"
          style={{ visibility: phase === "review" ? "hidden" : "visible" }}
        />

        {captured && phase === "review" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captured} alt="Your photo" className="absolute inset-0 h-full w-full object-cover" />
        )}

        {(phase === "live" || phase === "countdown") && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[62%] w-[66%] rounded-[50%] border-[3px] border-dashed border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
            <span className="absolute bottom-10 rounded-full bg-black/45 px-7 py-3 text-[24px] font-semibold backdrop-blur-md">
              Fit your face and hair inside the oval
            </span>
          </div>
        )}

        {phase === "countdown" && count > 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span key={count} className="animate-scale-in text-[260px] font-black leading-none text-white drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
              {count}
            </span>
          </div>
        )}

        {phase === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-[30px] text-white/70">
            Starting camera…
          </div>
        )}

        {phase === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-16 text-center">
            <VideoOff className="h-24 w-24 text-white/60" />
            <p className="text-[34px] font-bold">Camera isn&apos;t available</p>
            <p className="text-[26px] text-white/70">
              {insecure
                ? "The camera only works over https:// or on localhost. Open this page via https or http://localhost."
                : "Please ask a staff member for help."}
            </p>
            <GlassButton size="md" onClick={retake}>
              <RefreshCw className="h-8 w-8" /> Try again
            </GlassButton>
          </div>
        )}

        {flash && <div className="absolute inset-0 bg-white" />}
      </div>

      {/* Controls */}
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-6 px-12">
        {phase === "review" ? (
          <>
            {warnings.length > 0 && (
              <p className="flex items-center gap-3 rounded-full bg-amber-400/15 px-8 py-3 text-[24px] text-amber-200">
                <Sparkles className="h-7 w-7 shrink-0" /> {warnings[0]}
              </p>
            )}
            <div className="flex gap-6">
              <GlassButton onClick={retake}>
                <RefreshCw className="h-10 w-10" /> Retake
              </GlassButton>
              <button
                type="button"
                onClick={confirmPhoto}
                className="inline-flex min-h-[112px] items-center gap-4 rounded-full bg-gradient-to-r from-grad-1 via-grad-2 to-grad-3 px-14 text-[34px] font-bold shadow-[var(--shadow-brand)] active:scale-[0.97]"
              >
                <Check className="h-10 w-10 stroke-[3]" /> Use this photo
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={startCountdown}
              disabled={phase !== "live"}
              aria-label="Take photo"
              className="group flex h-[170px] w-[170px] items-center justify-center rounded-full border-[6px] border-white/80 bg-white/10 backdrop-blur-xl transition-transform active:scale-95 disabled:opacity-40"
            >
              <span className="flex h-[128px] w-[128px] items-center justify-center rounded-full bg-white text-ink">
                <Camera className="h-14 w-14" />
              </span>
            </button>
            <p className="text-[24px] text-white/55">
              Tap to take your photo · It&apos;s only used to create your try-on
            </p>
          </>
        )}
      </div>
    </div>
  );
}
