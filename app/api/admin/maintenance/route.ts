/**
 * GET  /api/admin/maintenance — current state of the site-wide kill switch.
 * POST /api/admin/maintenance — flip it, or edit the copy visitors see.
 *
 * The caller is already an authenticated admin by the time this runs
 * (proxy.ts), and requireAdmin narrows that to super_admin. MAINTENANCE_PASSWORD
 * is the second, independent factor: role alone can't take the storefront
 * down. See lib/maintenance.ts.
 */

export const runtime = "nodejs"; // node:crypto — HMAC/timing-safe compare

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";
import {
  BYPASS_COOKIE_OPTIONS,
  BYPASS_SESSION_SECONDS,
  MAINTENANCE_BYPASS_COOKIE,
  getMaintenanceState,
  hasValidBypassToken,
  isMaintenanceToggleConfigured,
  mintBypassToken,
  setMaintenanceMessage,
  setMaintenanceMode,
  verifyMaintenancePassword,
} from "@/lib/maintenance";

const bodySchema = z.object({
  enabled: z.boolean(),
  password: z.string().min(1, "Password is required."),
  message: z.string().trim().min(1).max(500).optional(),
});

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  const state = await getMaintenanceState();
  return NextResponse.json({
    ...state,
    configured: isMaintenanceToggleConfigured(),
    // Whether THIS browser is exempt. Without surfacing it, an admin who just
    // closed the site loads the storefront, sees it working, and concludes the
    // switch is broken — the bypass is invisible otherwise.
    bypassing: hasValidBypassToken(
      request.cookies.get(MAINTENANCE_BYPASS_COOKIE)?.value
    ),
  });
}

/**
 * DELETE /api/admin/maintenance — give up this browser's preview bypass.
 *
 * No password: dropping your own exemption only ever removes access, so it
 * can't be used to reach anything you couldn't already reach.
 */
export async function DELETE() {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  const response = NextResponse.json({ bypassing: false });
  response.cookies.set(MAINTENANCE_BYPASS_COOKIE, "", {
    ...BYPASS_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  const parsed = await parseJsonBody(request, bodySchema);
  if (parsed.error) return parsed.error;
  const { enabled, password, message } = parsed.data;

  const check = verifyMaintenancePassword(admin.id, password);
  if (!check.ok) {
    if (check.reason === "not_configured") {
      return NextResponse.json(
        { error: "MAINTENANCE_PASSWORD is not set on this deployment." },
        { status: 503 }
      );
    }
    if (check.reason === "locked_out") {
      return NextResponse.json(
        {
          error: "Too many incorrect attempts. Try again later.",
          retryAfterMs: check.retryAfterMs,
        },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  // Message first: if it's being changed alongside a shutdown, visitors should
  // never see the old copy in the window between the two writes.
  if (message !== undefined) {
    const written = await setMaintenanceMessage(message, admin.id);
    if (!written.ok) {
      return NextResponse.json({ error: written.error }, { status: 500 });
    }
  }

  const result = await setMaintenanceMode(enabled, admin.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  console.warn(
    `[maintenance] ${enabled ? "ENABLED" : "DISABLED"} by ${admin.email} (${admin.id})`
  );

  const state = await getMaintenanceState();
  // Enabling mints this browser's bypass below, disabling clears it — so the
  // exemption always tracks the switch.
  const response = NextResponse.json({
    ...state,
    configured: true,
    bypassing: enabled,
  });

  // Let whoever just closed the site keep browsing it, and drop the bypass as
  // soon as they reopen it so a stale cookie can't mask a later outage.
  if (enabled) {
    const token = mintBypassToken();
    if (token) {
      response.cookies.set(MAINTENANCE_BYPASS_COOKIE, token, {
        ...BYPASS_COOKIE_OPTIONS,
        maxAge: BYPASS_SESSION_SECONDS,
      });
    }
  } else {
    response.cookies.set(MAINTENANCE_BYPASS_COOKIE, "", {
      ...BYPASS_COOKIE_OPTIONS,
      maxAge: 0,
    });
  }

  return response;
}
