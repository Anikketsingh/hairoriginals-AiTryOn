/**
 * POST /api/sessions
 *
 * Creates a new device session and grants guest_free_generations credits.
 * Called by the browser on first visit if no session token is in localStorage.
 *
 * Body (JSON): { fingerprint?: string }
 * Returns: { sessionToken: string, sessionId: string, creditsGranted: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantCredits, getSessionByToken, findGuestSessionByFingerprint } from "@/lib/funnel";
import { getGuestFreeGenerations } from "@/lib/settings";
import { getClientIp, checkSessionRateLimit } from "@/lib/rate-limit";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { getDeviceCookie, setDeviceCookie } from "@/lib/device-cookie";
import { maintenanceGuard } from "@/lib/maintenance";

// Body is optional in practice (a bare POST with no body is valid — the
// fingerprint just won't be captured), so this is validated directly with
// safeParse against `{}` rather than lib/validate's parseJsonBody, which
// treats an empty/malformed body as a hard 400.
const bodySchema = z.object({ fingerprint: z.string().max(500).optional() });

export async function POST(request: NextRequest) {
  try {
    const closed = await maintenanceGuard(request);
    if (closed) return closed;

    const ipRaw = getClientIp(request);

    const allowed = await checkSessionRateLimit(ipRaw);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    const rawBody = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const fingerprint = parsed.data.fingerprint ?? "unknown";

    // Hash the fingerprint (SHA-256 via Web Crypto — available in Edge/Node)
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(fingerprint)
    );
    const fingerprintHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Hash IP for secondary guest signal
    const ipHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(ipRaw)
    );
    const ipHash = Array.from(new Uint8Array(ipHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // ── Resolve an existing device before minting a new one ────
    // The httpOnly cookie is authoritative (page JS can't clear it, unlike
    // localStorage); the fingerprint is only a client-supplied hint used
    // when the cookie is missing (e.g. a first request from a browser that
    // already has a session_token in localStorage from before this cookie
    // existed). Either way: no cookie/fingerprint match means no new
    // guest_free grant — that's what makes the 1 free try-on stick.
    const cookieToken = getDeviceCookie(request);
    const existing = cookieToken
      ? await getSessionByToken(cookieToken)
      : await findGuestSessionByFingerprint(fingerprintHash);

    if (existing) {
      const response = NextResponse.json(
        {
          sessionToken: existing.session_token,
          sessionId: existing.id,
          creditsGranted: 0,
        },
        { status: 200 }
      );
      setDeviceCookie(response, existing.session_token);
      return response;
    }

    // Create device session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("device_sessions")
      .insert({
        fingerprint_hash: fingerprintHash,
        ip_hash: ipHash,
      })
      .select("id, session_token")
      .single();

    if (sessionError || !session) {
      console.error("[/api/sessions] Create session error:", sessionError?.message);
      return NextResponse.json(
        { error: "Failed to create session." },
        { status: 500 }
      );
    }

    // Grant guest free credits
    const guestCredits = await getGuestFreeGenerations();
    await grantCredits(session.id, null, "guest_free", guestCredits);
    await recordAnalyticsEvent("session_created", { creditsGranted: guestCredits }, session.id, null);

    const response = NextResponse.json(
      {
        sessionToken: session.session_token,
        sessionId: session.id,
        creditsGranted: guestCredits,
      },
      { status: 201 }
    );
    setDeviceCookie(response, session.session_token);
    return response;
  } catch (err) {
    console.error("[/api/sessions] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
