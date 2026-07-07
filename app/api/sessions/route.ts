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
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/funnel";
import { getGuestFreeGenerations } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const fingerprint = (body?.fingerprint as string) ?? "unknown";

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
    const ipRaw =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const ipHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(ipRaw)
    );
    const ipHash = Array.from(new Uint8Array(ipHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

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

    return NextResponse.json(
      {
        sessionToken: session.session_token,
        sessionId: session.id,
        creditsGranted: guestCredits,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[/api/sessions] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
