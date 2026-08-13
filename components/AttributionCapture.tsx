"use client";

/**
 * components/AttributionCapture.tsx
 *
 * Records how the visitor arrived (utm_*, campaign/ad ids, click ids, referrer,
 * landing URL) into the first-touch cookie read by lib/attribution.ts. Mounted
 * once in the customer layout; renders nothing.
 *
 * Why the URL is read during render rather than in the effect: React runs child
 * effects before parent effects, and the step-sync effect in
 * app/(customer)/page.tsx rewrites the URL via pushState. A layout-level effect
 * would therefore run *after* the funnel had already replaced the landing URL.
 * Reading in a useState initializer captures it on the very first render pass,
 * before any effect anywhere has run.
 */

import { useEffect, useState } from "react";
import {
  parseAttribution,
  readClientAttribution,
  shouldReplace,
  writeClientAttribution,
  type Attribution,
} from "@/lib/attribution";

export default function AttributionCapture() {
  const [landing] = useState<Attribution | null>(() => {
    if (typeof window === "undefined") return null;
    return parseAttribution(window.location.search, document.referrer, window.location.href);
  });

  useEffect(() => {
    if (!landing) return;
    if (!shouldReplace(readClientAttribution(), landing)) return;
    writeClientAttribution(landing);
  }, [landing]);

  return null;
}
