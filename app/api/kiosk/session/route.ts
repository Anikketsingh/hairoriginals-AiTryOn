/**
 * POST /api/kiosk/session
 *
 * Starts a fresh visitor session on a standee — called each time someone
 * taps "Start". The web app ties free credits to the device (lib/device-
 * cookie.ts), which on a shared standee would hand every walk-up the first
 * visitor's spent allowance. Here each visitor gets their own device_sessions
 * row and their own `kiosk_visitor` credits; the per-standee daily cap
 * (enforced in /api/generate) is what bounds cost instead.
 *
 * The session token is returned in the body only — it is held in the kiosk
 * page's memory and dropped on reset, never stored in a cookie or
 * localStorage, so the next visitor can't inherit it.
 *
 * Returns: { sessionToken, sessionId, creditsGranted }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/funnel";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { checkKioskSessionRateLimit } from "@/lib/rate-limit";
import { maintenanceGuard } from "@/lib/maintenance";
import { countKioskGenerationsToday, requireKiosk } from "@/lib/kiosk-auth";

export async function POST(request: NextRequest) {
  const closed = await maintenanceGuard(request);
  if (closed) return closed;

  const kiosk = await requireKiosk(request);
  if (kiosk instanceof NextResponse) return kiosk;

  try {
    const allowed = await checkKioskSessionRateLimit(kiosk.id);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    if ((await countKioskGenerationsToday(kiosk.id)) >= kiosk.config.dailyGenerationCap) {
      return NextResponse.json(
        { error: "This kiosk has reached its try-on limit for today.", code: "kiosk_daily_cap" },
        { status: 429 }
      );
    }

    // fingerprint_hash is NOT NULL; a fixed per-standee marker keeps these
    // rows out of the web app's fingerprint lookup (findGuestSessionByFingerprint
    // only ever sees SHA-256 hex, which can't collide with this prefix).
    const { data: session, error } = await supabaseAdmin
      .from("device_sessions")
      .insert({ fingerprint_hash: `kiosk:${kiosk.id}`, kiosk_id: kiosk.id })
      .select("id, session_token")
      .single();

    if (error || !session) {
      console.error("[/api/kiosk/session] Create session error:", error?.message);
      return NextResponse.json({ error: "Failed to start a session." }, { status: 500 });
    }

    await grantCredits(session.id, null, "kiosk_visitor", kiosk.config.triesPerVisitor);
    await recordAnalyticsEvent(
      "kiosk_session_started",
      { kioskId: kiosk.id, creditsGranted: kiosk.config.triesPerVisitor },
      session.id,
      null
    );

    return NextResponse.json(
      {
        sessionToken: session.session_token,
        sessionId: session.id,
        creditsGranted: kiosk.config.triesPerVisitor,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[/api/kiosk/session] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
