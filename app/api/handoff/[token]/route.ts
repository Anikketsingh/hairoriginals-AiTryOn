/**
 * GET /api/handoff/[token]
 *
 * Everything the standee phone page (/s/[token]) needs: the visit's looks,
 * whether a number has been given yet, and the offer/contact config. The
 * first call marks the QR as scanned, which the standee shows live.
 *
 * Before a number is given the page shows the looks blurred; the URLs are
 * still the visitor's own photos, so this is a nudge, not a lock.
 */

import { NextRequest, NextResponse } from "next/server";
import { getKioskOfferConfig } from "@/lib/settings";
import {
  MAX_LOOKS_SMS,
  getOrCreateSessionDownload,
  getSessionLooks,
  markScanned,
  maskPhone,
} from "@/lib/kiosk-handoff";
import { isLooksSmsConfigured } from "@/lib/sms";
import { loadHandoff } from "./guard";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const handoff = await loadHandoff(request, token);
  if (handoff instanceof NextResponse) return handoff;

  try {
    await markScanned(handoff);
    const claimed = Boolean(handoff.claimedAt && handoff.leadId);

    const [looks, offer, downloadUrl] = await Promise.all([
      getSessionLooks(handoff.sessionId),
      getKioskOfferConfig(),
      claimed ? getOrCreateSessionDownload(handoff) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      claimed,
      kioskName: handoff.kioskName,
      looks,
      offer,
      contactName: claimed ? handoff.contactName : null,
      maskedPhone: claimed ? maskPhone(handoff.phone) : null,
      // Only after a number is given — this is the link the SMS/WhatsApp carries.
      downloadUrl,
      smsRemaining: Math.max(0, MAX_LOOKS_SMS - handoff.smsSentCount),
      smsAvailable: claimed && handoff.phone ? isLooksSmsConfigured(handoff.phone) : null,
    });
  } catch (err) {
    console.error("[/api/handoff/[token]] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
