/**
 * POST /api/kiosk/lead
 *
 * Captures a walk-up visitor's phone number (and optional name) on the
 * standee and attaches it to their lead, which then flows to the CRM like any
 * other lead (source 'kiosk', with the standee's name/location attached).
 *
 * The number is NOT OTP-verified here. Whether the kiosk should verify it
 * by SMS is still an open product decision; if it should, add the OTP step
 * in front of this call rather than routing the standee through Supabase
 * Auth, which would sign the shared browser into a customer's account.
 *
 * Body: { sessionToken, phone (national digits), country?: ISO code (default IN), name?, consent: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CountryCode } from "libphonenumber-js";
import { parseJsonBody } from "@/lib/validate";
import { validatePhone, validationMessage } from "@/lib/phone";
import { attachKioskContact } from "@/lib/leads";
import { getKioskVisitorSession, requireKiosk } from "@/lib/kiosk-auth";

const bodySchema = z.object({
  sessionToken: z.string().min(1).max(200),
  phone: z.string().min(1).max(32),
  country: z.string().length(2).optional(),
  name: z.string().trim().max(120).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required." }) }),
});

export async function POST(request: NextRequest) {
  const kiosk = await requireKiosk(request);
  if (kiosk instanceof NextResponse) return kiosk;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { sessionToken, phone, country, name } = parsed.data;

    const session = await getKioskVisitorSession(kiosk, sessionToken);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const validation = validatePhone(phone, (country?.toUpperCase() ?? "IN") as CountryCode);
    if (!validation.ok) {
      return NextResponse.json({ error: validationMessage(validation.reason) }, { status: 400 });
    }

    const { leadId } = await attachKioskContact({
      sessionId: session.id,
      kioskId: kiosk.id,
      phone: validation.e164,
      name: name || null,
    });
    if (!leadId) {
      return NextResponse.json({ error: "Could not save your details." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/kiosk/lead] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
