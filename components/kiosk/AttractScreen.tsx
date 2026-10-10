"use client";

/**
 * Idle screen: the standee's own looping video (uploaded per kiosk in
 * Admin → Kiosks), with one big frosted-glass button to start. Without a
 * video — or if it fails to load — it falls back to a cross-fading
 * before/after of the bundled sample photos, so the screen is never blank.
 */

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { GlassButton, KioskLogo } from "@/components/kiosk/ui";

const FALLBACK_FRAMES = ["/before.png", "/after.png"];

export default function AttractScreen({
  videoUrl,
  starting,
  error,
  onStart,
}: {
  videoUrl: string | null;
  starting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  // Remember a broken URL rather than a flag, so uploading a new video from
  // the admin panel (a different URL) gets a fresh chance to play.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const showVideo = !!videoUrl && brokenUrl !== videoUrl;

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={starting}
      aria-label="Start your try-on"
      className="relative block h-full w-full overflow-hidden bg-ink text-left"
    >
      {showVideo ? (
        <video
          key={videoUrl}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onError={() => setBrokenUrl(videoUrl)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <FallbackLoop />
      )}

      {/* Legibility: darken the top for the logo and the bottom for the button. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-black/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-black/60 via-black/25 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex justify-center pt-[5vh]">
        <KioskLogo light className="h-16" />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-8 px-16 pb-[9vh]">
        {!showVideo && (
          <h1 className="text-center text-[64px] font-extrabold leading-[1.08] tracking-tight text-white drop-shadow-lg">
            See yourself with
            <br />
            new hair in seconds
          </h1>
        )}
        {/* Decorative: the whole screen is the tap target, this just says so. */}
        <span className="relative">
          <span className="absolute -inset-3 animate-ping rounded-full bg-white/15 [animation-duration:2.4s]" />
          <GlassButton as="span" size="xl" disabled={starting}>
            <Sparkles className="h-12 w-12" />
            {starting ? "Starting…" : "Tap to try on"}
          </GlassButton>
        </span>
        {error && (
          <p className="rounded-full bg-black/50 px-8 py-3 text-[26px] font-medium text-white backdrop-blur-md">{error}</p>
        )}
      </div>
    </button>
  );
}

function FallbackLoop() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % FALLBACK_FRAMES.length), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-grad-1 via-grad-2 to-grad-3">
      {FALLBACK_FRAMES.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms]"
          style={{ opacity: i === frame ? 1 : 0 }}
        />
      ))}
      <span className="absolute left-1/2 top-[16%] -translate-x-1/2 rounded-full bg-black/40 px-8 py-3 text-[28px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur-md">
        {frame === 0 ? "Before" : "After"}
      </span>
    </div>
  );
}
