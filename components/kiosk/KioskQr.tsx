"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Renders `value` as a QR code image, client-side (no third-party QR service sees the link). */
export default function KioskQr({ value, size = 320 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setSrc(url))
      .catch((err) => console.error("[KioskQr] render failed:", err));
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size }} className="rounded-2xl bg-surface-sunken animate-pulse" />;
  // eslint-disable-next-line @next/next/no-img-element -- data URL
  return <img src={src} width={size} height={size} alt="Scan to download your look" className="rounded-2xl bg-white p-3" />;
}
