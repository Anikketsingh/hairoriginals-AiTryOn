/**
 * GET /api/home-trial
 *
 * The result-screen home trial offer, for the customer app.
 *
 * Public and unauthenticated: this is marketing copy and a storefront link,
 * nothing customer-specific, and the response is identical for every visitor.
 *
 * The offer is admin-editable (see supabase/migrations/20260820000001), and
 * lib/settings.ts already caches the underlying rows for 60s in-process —
 * so this route adds no cache headers of its own and stays correct the moment
 * an admin save calls invalidateAllSettings().
 */

import { NextResponse } from "next/server";
import { getHomeTrialConfig } from "@/lib/settings";
import { maintenanceGuard } from "@/lib/maintenance";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";

export async function GET(request: Request) {
  try {
    const closed = await maintenanceGuard(request);
    if (closed) return closed;

    const config = await getHomeTrialConfig();

    return NextResponse.json({
      ...config,
      // An uploaded banner is a Storage URL built from the server's internal
      // SUPABASE_URL, which a phone can't resolve. A path under public/ or an
      // external URL passes through untouched.
      imageWomen: toPublicStorageUrl(config.imageWomen) ?? config.imageWomen,
      imageMen: toPublicStorageUrl(config.imageMen) ?? config.imageMen,
    });
  } catch (err) {
    console.error("[/api/home-trial] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
