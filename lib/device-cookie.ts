/**
 * lib/device-cookie.ts
 *
 * Durable, httpOnly device identity for anonymous guests. Before this,
 * device identity lived entirely in localStorage (hair_session_token,
 * hair_fp) — page JS could read and clear both, so clearing storage (or
 * just re-POSTing /api/sessions) minted a fresh device_sessions row with a
 * fresh guest_free credit every time. This cookie can't be touched by page
 * JS, so /api/sessions can trust it to resolve a returning device back to
 * the session it already spent its free credit on.
 *
 * Follows the NextRequest/NextResponse cookie convention already used in
 * lib/supabase/proxy.ts rather than next/headers' cookies().
 */

import type { NextRequest, NextResponse } from "next/server";

export const DEVICE_COOKIE = "ho_device";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export function getDeviceCookie(request: NextRequest): string | null {
  return request.cookies.get(DEVICE_COOKIE)?.value ?? null;
}

export function setDeviceCookie(response: NextResponse, sessionToken: string): void {
  response.cookies.set(DEVICE_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
