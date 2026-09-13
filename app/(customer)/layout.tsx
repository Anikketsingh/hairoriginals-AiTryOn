import { cookies, headers } from "next/headers";
import { ToastProvider } from "@/components/ui/Toast";
import { GeoProvider } from "@/components/GeoProvider";
import { DevGeoProvider } from "@/components/DevGeoProvider";
import AttributionCapture from "@/components/AttributionCapture";
import MaintenanceScreen from "@/components/MaintenanceScreen";
import {
  MAINTENANCE_BYPASS_COOKIE,
  getMaintenanceState,
  hasValidBypassToken,
} from "@/lib/maintenance";

/**
 * Development substitutes `?geo=US` for the geo header so the country picker's
 * non-India defaults can be exercised at all — see components/DevGeoProvider.
 *
 * Resolved once at module scope, not per request. Gated on NODE_ENV rather
 * than a NEXT_PUBLIC_* flag on purpose: those are inlined at build time, so
 * setting one in the Vercel dashboard would ship the override to real
 * visitors, which is exactly what must never happen.
 */
const Geo = process.env.NODE_ENV === "production" ? GeoProvider : DevGeoProvider;

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read request state before touching the database: these are what mark the
  // subtree dynamic, so the maintenance lookup can never be answered from a
  // build-time prerender that predates the switch being flipped.
  const bypass = (await cookies()).get(MAINTENANCE_BYPASS_COOKIE)?.value;
  // Vercel injects this on every request at no cost, so the phone gate can
  // default to the visitor's country instead of always +91. Absent locally and
  // on non-Vercel hosts, in which case this is null and the Geo swap above
  // decides what development stands in with.
  const country = (await headers()).get("x-vercel-ip-country");

  // Every customer page lives under this layout, so gating here closes the
  // whole storefront in one place. /admin sits in its own route group and is
  // untouched — that's what turns the switch back off. The matching guard for
  // customer API routes is maintenanceGuard() in lib/maintenance.ts.
  const maintenance = await getMaintenanceState();
  if (maintenance.enabled && !hasValidBypassToken(bypass)) {
    return <MaintenanceScreen message={maintenance.message} />;
  }

  return (
    <Geo country={country}>
      {/* Records the landing URL's marketing params before the funnel rewrites
          it — see components/AttributionCapture.tsx. */}
      <AttributionCapture />
      <ToastProvider>{children}</ToastProvider>
    </Geo>
  );
}
