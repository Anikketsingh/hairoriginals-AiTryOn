/**
 * POST /api/kiosk/enroll
 *
 * One-time standee registration. An admin creates a kiosk in Admin → Kiosks
 * and gets an enrollment link (/kiosk/enroll?code=...); opening it on the
 * standee posts the code here. On success the standee gets a fresh device
 * secret in an httpOnly cookie and the code is burned. Re-enrolling replaces
 * the previous secret, so an old standee/cookie stops working immediately.
 *
 * Body: { code: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validate";
import { getClientIp, checkSessionRateLimit } from "@/lib/rate-limit";
import {
  generateDeviceSecret,
  hashSecret,
  setKioskCookie,
} from "@/lib/kiosk-auth";

const bodySchema = z.object({
  code: z
    .string()
    .trim()
    .min(6)
    .max(32)
    .transform((c) => c.toUpperCase()),
});

export async function POST(request: NextRequest) {
  try {
    // Codes are short enough to be worth guarding against guessing.
    const allowed = await checkSessionRateLimit(`kiosk-enroll:${getClientIp(request)}`);
    if (!allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
    }

    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    const { data: kiosk } = await supabaseAdmin
      .from("kiosks")
      .select("id, name, is_active, enroll_expires_at")
      .eq("enroll_code_hash", hashSecret(parsed.data.code))
      .maybeSingle();

    const expired =
      !kiosk?.enroll_expires_at || new Date(kiosk.enroll_expires_at as string).getTime() < Date.now();
    if (!kiosk || expired || !kiosk.is_active) {
      return NextResponse.json(
        { error: "This enrollment code is invalid or has expired. Generate a new one in Admin → Kiosks." },
        { status: 400 }
      );
    }

    const secret = generateDeviceSecret();
    const { error } = await supabaseAdmin
      .from("kiosks")
      .update({
        token_hash: hashSecret(secret),
        enroll_code_hash: null,
        enroll_expires_at: null,
        enrolled_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", kiosk.id);

    if (error) {
      console.error("[/api/kiosk/enroll] Update error:", error.message);
      return NextResponse.json({ error: "Enrollment failed." }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true, kiosk: { id: kiosk.id, name: kiosk.name } });
    setKioskCookie(response, secret);
    return response;
  } catch (err) {
    console.error("[/api/kiosk/enroll] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
