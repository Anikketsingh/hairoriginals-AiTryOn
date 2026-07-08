/**
 * GET /api/cron/dispatch-events
 *
 * Durable backstop for outbound CRM webhook delivery. Drains due
 * integration_events (pending/failed, next_attempt_at <= now) and delivers
 * them with exponential backoff. Immediate delivery happens inline at dispatch
 * time (lib/event-bus.ts); this sweeper catches anything that missed —
 * transient failures, nested-after() dispatches, or a CRM outage.
 *
 * Auth: Bearer CRON_SECRET. Wire to Vercel Cron (see vercel.json) or any
 * external scheduler. Returns a small summary for observability.
 */

import { NextRequest, NextResponse } from "next/server";
import { sweepDueEvents } from "@/lib/webhooks/delivery";
import { getCronSecret } from "@/lib/webhooks/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = getCronSecret();
  if (!secret) {
    return NextResponse.json({ error: "Cron sweeper is not configured." }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await sweepDueEvents();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[/api/cron/dispatch-events] Error:", err);
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
