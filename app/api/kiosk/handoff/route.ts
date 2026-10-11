/**
 * POST /api/kiosk/handoff
 *
 * Returns the QR link for the current standee visit (/s/<token>), creating it
 * the first time. One link per visit: it shows every look from the visit,
 * including ones made after it was scanned.
 *
 * Body: { sessionToken }
 * Returns: { token, url }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validate";
import { getKioskVisitorSession, requireKiosk } from "@/lib/kiosk-auth";
import { getOrCreateHandoff, handoffUrl, recordKioskLeadEvent } from "@/lib/kiosk-handoff";

const bodySchema = z.object({ sessionToken: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  const kiosk = await requireKiosk(request);
  if (kiosk instanceof NextResponse) return kiosk;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    const session = await getKioskVisitorSession(kiosk, parsed.data.sessionToken);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

    const handoff = await getOrCreateHandoff(session.id, kiosk.id);
    if (!handoff) return NextResponse.json({ error: "Couldn't create the link." }, { status: 500 });

    if (handoff.created) {
      await recordKioskLeadEvent({
        handoff: { token: handoff.token, kioskId: kiosk.id, leadId: null },
        event: "qr_shown",
      });
    }

    return NextResponse.json({ token: handoff.token, url: handoffUrl(handoff.token) });
  } catch (err) {
    console.error("[/api/kiosk/handoff] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
