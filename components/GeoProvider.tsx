"use client";

/**
 * components/GeoProvider.tsx
 *
 * Makes the visitor's country available to client components.
 *
 * The value comes from Vercel's `x-vercel-ip-country` header, read in the
 * server layout — no third-party geo-IP lookup, no extra request, no cost.
 * Locally (and on any non-Vercel host) the header is absent and this is null,
 * which callers treat as "unknown" and fall back to their own default.
 *
 * Used by the phone gate to seed the country picker, which previously
 * hardcoded +91 for every visitor on earth.
 */

import { createContext, useContext } from "react";

const GeoCountryContext = createContext<string | null>(null);

export function GeoProvider({
  country,
  children,
}: {
  country: string | null;
  children: React.ReactNode;
}) {
  return <GeoCountryContext.Provider value={country}>{children}</GeoCountryContext.Provider>;
}

/** ISO 3166-1 alpha-2 for the visitor's country, or null when unknown. */
export function useGeoCountry(): string | null {
  return useContext(GeoCountryContext);
}
