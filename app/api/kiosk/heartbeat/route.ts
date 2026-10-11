/**
 * POST /api/kiosk/heartbeat
 *
 * Called by the standee on boot and then every minute. Doubles as the
 * kiosk's "who am I" call: it returns the standee's name and config, so the
 * kiosk UI never hardcodes timeouts or caps. Admin → Kiosks reads
 * last_seen_at to show Online/Offline.
 *
 * Also re-sets the device cookie, sliding its expiry forward — browsers cap
 * cookie lifetime at 400 days, and a standee must never silently unenroll.
 *
 * Body (optional): { appVersion?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getKioskOfferConfig } from "@/lib/settings";
import {
  KIOSK_COOKIE,
  countKioskGenerationsToday,
  requireKiosk,
  setKioskCookie,
} from "@/lib/kiosk-auth";

const bodySchema = z.object({ appVersion: z.string().max(64).optional() });

export async function POST(request: NextRequest) {
  const kiosk = await requireKiosk(request);
  if (kiosk instanceof NextResponse) return kiosk;

  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    const appVersion = parsed.success ? parsed.data.appVersion ?? null : null;

    const [, generationsToday, offer] = await Promise.all([
      supabaseAdmin
        .from("kiosks")
        .update({ last_seen_at: new Date().toISOString(), ...(appVersion ? { app_version: appVersion } : {}) })
        .eq("id", kiosk.id),
      countKioskGenerationsToday(kiosk.id),
      getKioskOfferConfig(),
    ]);

    const response = NextResponse.json({
      kiosk: { id: kiosk.id, name: kiosk.name, location: kiosk.location },
      config: kiosk.config,
      generationsToday,
      capReached: generationsToday >= kiosk.config.dailyGenerationCap,
      // Shown on the result screen's "send to my phone" card as the lure.
      offerDiscountPercent: offer.discountPercent,
    });
    // requireKiosk already validated this cookie, so it is present.
    setKioskCookie(response, request.cookies.get(KIOSK_COOKIE)!.value);
    return response;
  } catch (err) {
    console.error("[/api/kiosk/heartbeat] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
