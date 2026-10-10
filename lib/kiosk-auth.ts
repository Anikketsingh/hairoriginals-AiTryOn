/**
 * lib/kiosk-auth.ts
 *
 * Device authentication for the in-store video standees (/kiosk). Without
 * it, anyone could open /kiosk on their phone and mint unlimited per-visitor
 * credits. Each standee is a `kiosks` row; it proves who it is with a random
 * device secret in an httpOnly cookie, set once during enrollment
 * (POST /api/kiosk/enroll). Only the secret's SHA-256 is stored, so a DB
 * read alone can't impersonate a standee.
 *
 * Mirrors lib/admin-auth.ts: call `requireKiosk(request)` at the top of every
 * kiosk Route Handler.
 *
 * Server-only — imports lib/supabase/server.ts.
 */

import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { REPORTING_TIMEZONE, startOfDayIso } from "@/lib/date-range";

export const KIOSK_COOKIE = "ho_kiosk";
// Chrome/Edge cap cookie lifetime at 400 days; the heartbeat re-sets the
// cookie every minute, so in practice it never gets near that.
const KIOSK_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** How long an admin-issued enrollment code stays valid. */
export const ENROLL_CODE_TTL_MS = 24 * 60 * 60 * 1000;

export interface KioskConfig {
  /** Try-ons each walk-up visitor gets before they must hand over (or be asked for) a number. */
  triesPerVisitor: number;
  /** Hard ceiling on generations per standee per reporting-timezone calendar day — the cost guard. */
  dailyGenerationCap: number;
  /** Seconds without a touch before the kiosk resets to the attract screen. */
  idleTimeoutSeconds: number;
  /** How long the QR download link for a result stays valid. */
  downloadLinkTtlHours: number;
  /**
   * Public URL of the looping attract-screen video (kiosk-media bucket),
   * uploaded per standee from Admin → Kiosks. Null = built-in fallback.
   */
  attractVideoUrl: string | null;
}

/** The numeric knobs, editable as plain number inputs in Admin → Kiosks. */
export const KIOSK_NUMERIC_KEYS = [
  "triesPerVisitor",
  "dailyGenerationCap",
  "idleTimeoutSeconds",
  "downloadLinkTtlHours",
] as const;

export const KIOSK_CONFIG_DEFAULTS: KioskConfig = {
  triesPerVisitor: 3,
  dailyGenerationCap: 300,
  idleTimeoutSeconds: 90,
  downloadLinkTtlHours: 24 * 7,
  attractVideoUrl: null,
};

/** Storage bucket holding the attract videos (see 20261010000001_kiosk_media_bucket.sql). */
export const KIOSK_MEDIA_BUCKET = "kiosk-media";

export interface KioskContext {
  id: string;
  name: string;
  location: string | null;
  config: KioskConfig;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** 32 random bytes, URL-safe — the standee's long-lived device secret. */
export function generateDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Short code an admin types or scans on the standee. Crockford-style
 * alphabet (no 0/O/1/I) because it may be read off a screen and typed on a
 * touch keyboard.
 */
export function generateEnrollCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Merge stored config over the defaults, dropping anything malformed. */
export function resolveKioskConfig(raw: unknown): KioskConfig {
  const stored = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...KIOSK_CONFIG_DEFAULTS };
  for (const key of KIOSK_NUMERIC_KEYS) {
    const v = stored[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[key] = Math.floor(v);
  }
  if (typeof stored.attractVideoUrl === "string" && stored.attractVideoUrl.startsWith("http")) {
    out.attractVideoUrl = stored.attractVideoUrl;
  }
  return out;
}

export function setKioskCookie(response: NextResponse, secret: string): void {
  response.cookies.set(KIOSK_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: KIOSK_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Resolves the calling standee from its cookie, or null if absent/revoked/inactive. */
export async function getKioskContext(request: NextRequest): Promise<KioskContext | null> {
  const secret = request.cookies.get(KIOSK_COOKIE)?.value;
  if (!secret) return null;
  return getKioskBySecret(secret);
}

export async function getKioskBySecret(secret: string): Promise<KioskContext | null> {
  const { data, error } = await supabaseAdmin
    .from("kiosks")
    .select("id, name, location, config, is_active")
    .eq("token_hash", hashSecret(secret))
    .maybeSingle();

  if (error || !data || !data.is_active) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    location: (data.location as string | null) ?? null,
    config: resolveKioskConfig(data.config),
  };
}

/**
 * Call at the top of every kiosk Route Handler:
 *
 *   const kiosk = await requireKiosk(request);
 *   if (kiosk instanceof NextResponse) return kiosk;
 */
export async function requireKiosk(request: NextRequest): Promise<KioskContext | NextResponse> {
  const kiosk = await getKioskContext(request);
  if (!kiosk) {
    return NextResponse.json(
      { error: "This device is not registered as a kiosk.", code: "kiosk_unregistered" },
      { status: 401 }
    );
  }
  return kiosk;
}

/** Today's date (YYYY-MM-DD) in the reporting timezone. */
function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: REPORTING_TIMEZONE }).format(new Date());
}

/** Generations this standee has started today (reporting-timezone calendar day). */
export async function countKioskGenerationsToday(kioskId: string): Promise<number> {
  const since = startOfDayIso(todayYmd());
  let query = supabaseAdmin
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("kiosk_id", kioskId);
  if (since) query = query.gte("created_at", since);
  const { count } = await query;
  return count ?? 0;
}

/**
 * Resolve a visitor session token for kiosk endpoints, insisting it belongs
 * to the calling standee — a token from another kiosk (or from the web app)
 * is treated as not found.
 */
export async function getKioskVisitorSession(
  kiosk: KioskContext,
  sessionToken: string
): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from("device_sessions")
    .select("id, kiosk_id")
    .eq("session_token", sessionToken)
    .maybeSingle();
  if (!data || data.kiosk_id !== kiosk.id) return null;
  return { id: data.id as string };
}
