"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { ChevronsLeftRight } from "lucide-react";

interface HeroBeforeAfterProps {
  beforeSrc: string;
  afterSrc: string;
}

/** Twinkling 4-point sparkle overlaid on the hero photo. */
function Sparkle({ className, delay = "0s" }: { className?: string; delay?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={{ animation: "twinkle 2.8s ease-in-out infinite", animationDelay: delay }}
    >
      <path d="M12 0c.9 6.9 5.1 11.1 12 12-6.9.9-11.1 5.1-12 12-.9-6.9-5.1-11.1-12-12C6.9 11.1 11.1 6.9 12 0Z" />
    </svg>
  );
}

/**
 * The home-screen hero: a draggable before/after comparison of a real
 * try-on. `touch-pan-y` keeps vertical page scrolling alive while
 * horizontal drags move the divider.
 */
export default function HeroBeforeAfter({ beforeSrc, afterSrc }: HeroBeforeAfterProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const moveTo = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) moveTo(e.clientX);
  };

  const endDrag = () => {
    draggingRef.current = false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") setPosition((p) => Math.max(0, p - 5));
    else if (e.key === "ArrowRight") setPosition((p) => Math.min(100, p + 5));
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Compare hair before and after"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      className="relative aspect-[4/5] w-full cursor-ew-resize touch-pan-y select-none overflow-hidden rounded-[1.6rem] bg-surface-sunken"
    >
      {/* After (full background) */}
      <Image
        src={afterSrc}
        alt="After the hairstyle try-on"
        fill
        priority
        sizes="(max-width: 448px) 100vw, 424px"
        className="object-cover"
        draggable={false}
      />

      {/* Before, clipped to the left of the divider */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <Image
          src={beforeSrc}
          alt="Before the hairstyle try-on"
          fill
          priority
          sizes="(max-width: 448px) 100vw, 424px"
          className="object-cover"
          draggable={false}
        />
      </div>

      {/* Decorative sparkles */}
      <Sparkle className="pointer-events-none absolute right-[9%] top-[8%] h-6 w-6 text-white/95 drop-shadow-md" />
      <Sparkle className="pointer-events-none absolute right-[3.5%] top-[17%] h-3.5 w-3.5 text-white/85" delay="1.3s" />

      {/* Labels */}
      <span className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-ink shadow-sm backdrop-blur-sm">
        Before
      </span>
      <span className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-ink shadow-sm backdrop-blur-sm">
        After
      </span>

      {/* Divider + handle */}
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_12px_rgba(0,0,0,0.2)]"
        style={{ left: `${position}%` }}
      >
        <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[var(--shadow-pop)]">
          <ChevronsLeftRight className="h-5 w-5 text-ink-soft" />
        </div>
      </div>
    </div>
  );
}
