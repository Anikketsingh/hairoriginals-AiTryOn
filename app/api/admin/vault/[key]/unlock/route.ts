/**
 * POST   /api/admin/vault/[key]/unlock — exchange the vault password for a
 *                                        short-lived unlock cookie.
 * DELETE /api/admin/vault/[key]/unlock — lock again immediately.
 *
 * The caller is already an authenticated super_admin by the time this runs
 * (proxy.ts + requireVaultOwner); the password is the second, independent
 * factor guarding bulk access to customer photos. See lib/vault.ts.
 */

export const runtime = "nodejs"; // node:crypto — HMAC/timing-safe compare

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  requireVaultOwner,
  unlockVault,
  VAULT_COOKIE,
  VAULT_COOKIE_OPTIONS,
  VAULT_SESSION_SECONDS,
} from "@/lib/vault";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const admin = await requireVaultOwner(key);
  if (admin instanceof NextResponse) return admin;

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body?.password === "string") password = body.password;
  } catch {
    // Malformed body is just a failed attempt — fall through to the check
    // below so it still counts against the attempt budget.
  }

  const result = unlockVault(admin, password);

  if (result === null) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  if ("retryAfterMs" in result) {
    return NextResponse.json(
      {
        error: "Too many incorrect attempts. Try again later.",
        retryAfterMs: result.retryAfterMs,
      },
      { status: 429 }
    );
  }

  const response = NextResponse.json({ unlocked: true, expiresIn: VAULT_SESSION_SECONDS });
  response.cookies.set(VAULT_COOKIE, result.token, {
    ...VAULT_COOKIE_OPTIONS,
    maxAge: VAULT_SESSION_SECONDS,
  });
  return response;
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const admin = await requireVaultOwner(key);
  if (admin instanceof NextResponse) return admin;

  const response = NextResponse.json({ unlocked: false });
  response.cookies.set(VAULT_COOKIE, "", { ...VAULT_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
