"use client";

/**
 * components/DevGeoProvider.tsx
 *
 * Development-only stand-in for Vercel's `x-vercel-ip-country`, letting
 * `?geo=US` drive the phone gate's country picker on localhost.
 *
 * A separate component rather than a branch inside GeoProvider, because
 * useSearchParams() cannot be called conditionally. Calling it unconditionally
 * there would put the hook in the production tree permanently, and a static
 * page that calls useSearchParams outside a Suspense boundary fails the build
 * — a tripwire left for whoever later reaches for force-static, PPR, or
 * cacheComponents. Swapping the whole component by NODE_ENV in the layout
 * keeps the hook structurally out of production instead of merely guarded.
 *
 * Its own file rather than a second export from GeoProvider.tsx: dropping one
 * entirely unreferenced module from the production bundle is far more reliable
 * than shaking a single export out of a module production already imports.
 *
 * The layout reads the query param through this component because layouts do
 * not receive searchParams in Next 16 — they don't re-render on navigation, so
 * the value would go stale. This is the framework's prescribed workaround.
 */

import { useSearchParams } from "next/navigation";
import { GeoProvider } from "@/components/GeoProvider";
import { DEV_GEO_PARAM, resolveGeoCountry } from "@/lib/geo";

export function DevGeoProvider({
  country,
  children,
}: {
  country: string | null;
  children: React.ReactNode;
}) {
  const override = useSearchParams().get(DEV_GEO_PARAM);
  return <GeoProvider country={resolveGeoCountry(country, override)}>{children}</GeoProvider>;
}
