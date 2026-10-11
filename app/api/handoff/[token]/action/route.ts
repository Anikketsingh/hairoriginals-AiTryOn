/**
 * POST /api/handoff/[token]/action
 *
 * The options on the standee phone page, after the visitor gave a number:
 *   send_photos — SMS the /d/<token> link with every look (max 3 per visit)
 *   home_trial  — claim the standee home-trial discount; flags the lead and
 *                 pushes it to the CRM so sales calls to schedule
 *   whatsapp / call / store — the page opens the link itself; this only
 *                 records the interest for Admin → Standee Leads
 *
 * Body: { action }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validate";
import { getKioskOfferConfig } from "@/lib/settings";
import { markKioskLeadInterest } from "@/lib/leads";
import { sendLooksLinkSms } from "@/lib/sms";
import { MAX_LOOKS_SMS, getOrCreateSessionDownload, maskPhone, recordKioskLeadEvent } from "@/lib/kiosk-handoff";
import { loadHandoff } from "../guard";

const bodySchema = z.object({
  action: z.enum(["send_photos", "home_trial", "whatsapp", "call", "store"]),
});

const EVENT_FOR = {
  whatsapp: "whatsapp_clicked",
  call: "call_clicked",
  store: "store_clicked",
} as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const handoff = await loadHandoff(request, token);
  if (handoff instanceof NextResponse) return handoff;
  if (!handoff.leadId || !handoff.phone) {
    return NextResponse.json({ error: "Please enter your number first." }, { status: 409 });
  }
  const leadId = handoff.leadId;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { action } = parsed.data;

    if (action === "send_photos") {
      if (handoff.smsSentCount >= MAX_LOOKS_SMS) {
        return NextResponse.json(
          { error: "We've already sent your photos a few times — please check your messages." },
          { status: 429 }
        );
      }
      const link = await getOrCreateSessionDownload(handoff);
      if (!link) return NextResponse.json({ error: "Couldn't prepare your photos." }, { status: 500 });

      const sms = await sendLooksLinkSms(handoff.phone, { name: handoff.contactName || "there", link });
      if (!sms.ok) {
        // Until the DLT template / SMS keys are configured, let local
        // development carry on with the link shown on the page instead.
        if (sms.reason === "not_configured" && process.env.NODE_ENV !== "production") {
          return NextResponse.json({ ok: true, smsSkipped: true, devLink: link });
        }
        console.error("[/api/handoff/action] SMS failed:", sms.reason, sms.message);
        return NextResponse.json({ error: "We couldn't send the SMS right now. Please try again." }, { status: 502 });
      }

      await supabaseAdmin
        .from("kiosk_handoffs")
        .update({ sms_sent_count: handoff.smsSentCount + 1 })
        .eq("token", handoff.token);
      await recordKioskLeadEvent({ handoff, event: "photo_link_sent", meta: { attempt: handoff.smsSentCount + 1 } });
      await markKioskLeadInterest({ leadId, sessionId: handoff.sessionId, interest: "photos_sent" });

      return NextResponse.json({
        ok: true,
        sentTo: maskPhone(handoff.phone),
        smsRemaining: MAX_LOOKS_SMS - handoff.smsSentCount - 1,
      });
    }

    if (action === "home_trial") {
      const offer = await getKioskOfferConfig();
      await recordKioskLeadEvent({ handoff, event: "home_trial_interest", meta: { discountPercent: offer.discountPercent } });
      await markKioskLeadInterest({ leadId, sessionId: handoff.sessionId, interest: "home_trial" });
      return NextResponse.json({ ok: true });
    }

    await recordKioskLeadEvent({ handoff, event: EVENT_FOR[action] });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/handoff/[token]/action] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
