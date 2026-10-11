/**
 * Shared guard for the public standee phone-page APIs (/api/handoff/[token]/*).
 * Not a route — only route.ts files are endpoints.
 */

import { NextResponse, type NextRequest } from "next/server";
import { checkHandoffRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveHandoff, type Handoff } from "@/lib/kiosk-handoff";

/** Rate-limit by token and IP, then resolve the handoff. Returns it, or a response to send. */
export async function loadHandoff(request: NextRequest, token: string): Promise<Handoff | NextResponse> {
  const [byToken, byIp] = await Promise.all([
    checkHandoffRateLimit(`t:${token}`),
    checkHandoffRateLimit(`ip:${getClientIp(request)}`),
  ]);
  if (!byToken || !byIp) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  const handoff = await resolveHandoff(token);
  if (!handoff) return NextResponse.json({ error: "Link not found.", code: "not_found" }, { status: 404 });
  if (handoff.expired) {
    return NextResponse.json({ error: "This link has expired.", code: "expired" }, { status: 410 });
  }
  return handoff;
}
