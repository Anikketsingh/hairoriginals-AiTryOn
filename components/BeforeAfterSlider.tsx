"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronsLeftRight } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeImage: string; // Data URL or URL of original photo
  afterImage: string;  // Base64 or Data URL of AI result
  mimeType?: string;
}

export default function BeforeAfterSlider({
  beforeImage,
  afterImage,
  mimeType = "image/jpeg",
}: BeforeAfterSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const afterSrc = afterImage.startsWith("data:")
    ? afterImage
    : `data:${mimeType};base64,${afterImage}`;

  // Use ResizeObserver to keep the clipped image exactly aligned with the container width
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    setSliderPosition(percentage);
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging) return;
      handleMove(e.touches[0].clientX);
    },
    [isDragging, handleMove]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      handleMove(e.clientX);
    },
    [isDragging, handleMove]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: true });
      window.addEventListener("touchend", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    handleMove(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleMove(e.touches[0].clientX);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className="relative mx-auto aspect-[3/4] w-full max-w-sm cursor-ew-resize select-none overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface-sunken shadow-[var(--shadow-pop)]"
    >
      {/* After Image (Full background) */}
      <img
        src={afterSrc}
        alt="AI Hair Try-On Result"
        className="absolute inset-0 w-full h-full object-cover"
        draggable="false"
      />
      <span className="absolute top-3 right-3 select-none rounded-full bg-ink/80 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-md">
        After
      </span>

      {/* Before Image (Clipped overlay) */}
      <div
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={beforeImage}
          alt="Original Customer Photo"
          className="absolute inset-y-0 left-0 h-full object-cover max-w-none"
          style={{ width: containerWidth ? `${containerWidth}px` : "100%" }}
          draggable="false"
        />
        <span className="absolute top-3 left-3 select-none rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-bold text-ink backdrop-blur-md">
          Before
        </span>
      </div>

      {/* Slider Divider Handle Line */}
      <div
        className="absolute inset-y-0 w-[2px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] pointer-events-none"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white text-black shadow-xl flex items-center justify-center border-2 border-white/20 active:scale-110 transition-transform">
          <ChevronsLeftRight className="w-4 h-4 text-neutral-800" />
        </div>
      </div>
    </div>
  );
}
