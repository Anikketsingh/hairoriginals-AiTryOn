/**
 * POST /api/handoff/[token]/claim
 *
 * The visitor gives their number (and optionally name) on the phone page.
 * Creates — or updates, if they're correcting a typo — their Standee Lead via
 * attachKioskContact (which also pushes it to the CRM), then unlocks the
 * options. Not OTP-verified by design: the photos only ever go out by SMS to
 * this number, so a fake number just means no photos.
 *
 * Body: { phone (national digits), country?: ISO (default IN), name?, consent: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CountryCode } from "libphonenumber-js";
import { parseJsonBody } from "@/lib/validate";
import { validatePhone, validationMessage } from "@/lib/phone";
import { attachKioskContact } from "@/lib/leads";
import { markClaimed, recordKioskLeadEvent } from "@/lib/kiosk-handoff";
import { loadHandoff } from "../guard";

const bodySchema = z.object({
  phone: z.string().min(1).max(32),
  country: z.string().length(2).optional(),
  name: z.string().trim().max(80).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Please accept to continue." }) }),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const handoff = await loadHandoff(request, token);
  if (handoff instanceof NextResponse) return handoff;
  if (!handoff.kioskId) return NextResponse.json({ error: "This link is no longer active." }, { status: 410 });

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    const country = (parsed.data.country?.toUpperCase() ?? "IN") as CountryCode;
    const validation = validatePhone(parsed.data.phone, country);
    if (!validation.ok) {
      return NextResponse.json({ error: validationMessage(validation.reason) }, { status: 400 });
    }
    const name = parsed.data.name || null;

    const { leadId } = await attachKioskContact({
      sessionId: handoff.sessionId,
      kioskId: handoff.kioskId,
      phone: validation.e164,
      name,
    });
    if (!leadId) return NextResponse.json({ error: "Couldn't save your details. Please try again." }, { status: 500 });

    await markClaimed(handoff, { leadId, phone: validation.e164, name });
    await recordKioskLeadEvent({
      handoff,
      leadId,
      event: "number_submitted",
      meta: handoff.claimedAt ? { corrected: true } : {},
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/handoff/[token]/claim] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
