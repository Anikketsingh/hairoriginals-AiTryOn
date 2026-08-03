/**
 * GET /api/sessions/[token]
 *
 * Returns the current funnel status for a session token.
 * Used by the browser to check credits remaining, stage, and gate messages.
 *
 * Note: In Next.js 16, `params` is a Promise and must be awaited.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveSessionStatus } from "@/lib/funnel";
import { setDeviceCookie } from "@/lib/device-cookie";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ error: "Missing session token." }, { status: 400 });
    }

    const status = await resolveSessionStatus(token);

    if (!status) {
      return NextResponse.json(
        { error: "Session not found. Create a new session via POST /api/sessions." },
        { status: 404 }
      );
    }

    // Anchors installed-base users (whose session predates the device
    // cookie) onto it the next time the browser checks its status — not
    // just new visitors going through POST /api/sessions.
    const response = NextResponse.json(status);
    setDeviceCookie(response, token);
    return response;
  } catch (err) {
    console.error("[/api/sessions/[token]] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
