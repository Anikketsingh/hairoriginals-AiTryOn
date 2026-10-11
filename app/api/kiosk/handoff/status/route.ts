/**
 * GET /api/kiosk/handoff/status?token=...
 *
 * Polled by the standee's QR panel every ~2s so it can say "Opened on your
 * phone ✓" and then "Check your phone 🎉" as the visitor progresses. Only the
 * standee that created the handoff can read it.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireKiosk } from "@/lib/kiosk-auth";

export async function GET(request: NextRequest) {
  const kiosk = await requireKiosk(request);
  if (kiosk instanceof NextResponse) return kiosk;

  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const { data } = await supabaseAdmin
    .from("kiosk_handoffs")
    .select("scanned_at, claimed_at, kiosk_id")
    .eq("token", token)
    .maybeSingle();

  if (!data || data.kiosk_id !== kiosk.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ scanned: Boolean(data.scanned_at), claimed: Boolean(data.claimed_at) });
}
