/**
 * lib/maintenance.ts
 *
 * Site-wide maintenance mode — the switch that closes the customer surface
 * without a redeploy.
 *
 * Two halves, deliberately kept apart:
 *
 *   State  — `maintenance_mode` / `maintenance_message` in the `settings`
 *            table, so the switch survives restarts and applies to every
 *            serverless instance at once.
 *   Authority — MAINTENANCE_PASSWORD, an env secret. An authenticated
 *            super_admin is *not* enough to flip it; they must also type the
 *            password. That's the point of the feature: a compromised or
 *            careless admin session can't take the storefront down, and only
 *            the person holding the env secret can bring it back.
 *
 * Fails open on purpose. If the password isn't configured the switch simply
 * refuses to move, and if the settings read errors we treat the site as up —
 * a database blip should never black out the storefront by itself.
 *
 * Server-only (node:crypto + service-role client).
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const MAINTENANCE_BYPASS_COOKIE = "ho_maintenance_bypass";

/**
 * How long the admin who flipped the switch can keep browsing the live
 * customer site. Long enough to actually do the maintenance, short enough
 * that a forgotten cookie doesn't hide an ongoing outage from them.
 */
export const BYPASS_SESSION_SECONDS = 12 * 60 * 60;

export const DEFAULT_MAINTENANCE_MESSAGE =
  "We're carrying out some quick maintenance and will be back shortly. Thanks for your patience!";

/** Wrong-password attempts allowed per admin before a cooldown. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Deliberately far shorter than lib/settings.ts's 60s. Flipping this switch is
 * an emergency action — waiting a minute for the storefront to actually close
 * (or reopen) is the wrong trade, and one settings row every few seconds is
 * cheap next to that.
 */
const CACHE_TTL_MS = 5_000;

export interface MaintenanceState {
  enabled: boolean;
  message: string;
}

let cache: { state: MaintenanceState; cachedAt: number } | null = null;

// ──────────────────────────────────────────────────────────────
// Reading the switch
// ──────────────────────────────────────────────────────────────

/**
 * Current state of the switch. Errors resolve to "site is up" — see the
 * fail-open note at the top of this file.
 */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
    return cache.state;
  }

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("key, value")
    .in("key", ["maintenance_mode", "maintenance_message"]);

  if (error || !data) {
    console.warn("[maintenance] Could not read state:", error?.message ?? "no rows");
    return { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE };
  }

  const rows = new Map(data.map((row) => [row.key, row.value]));
  const message = rows.get("maintenance_message");

  const state: MaintenanceState = {
    enabled: rows.get("maintenance_mode") === true,
    message:
      typeof message === "string" && message.trim() !== ""
        ? message
        : DEFAULT_MAINTENANCE_MESSAGE,
  };

  cache = { state, cachedAt: Date.now() };
  return state;
}

/** Drop the cached state so the next read hits Postgres (called after a toggle). */
export function invalidateMaintenanceCache(): void {
  cache = null;
}

// ──────────────────────────────────────────────────────────────
// The password
// ──────────────────────────────────────────────────────────────

function readPassword(): string | null {
  return process.env.MAINTENANCE_PASSWORD || null;
}

/**
 * Whether the switch can be operated at all. False means MAINTENANCE_PASSWORD
 * is unset, and the admin UI shows the toggle as unavailable rather than
 * letting someone discover mid-incident that it does nothing.
 */
export function isMaintenanceToggleConfigured(): boolean {
  return readPassword() !== null;
}

/**
 * Constant-time string equality. Hashing first means differing lengths don't
 * throw and don't leak the secret's length through timing.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Per-instance, so a distributed attacker sees a weaker limit than this
// implies — but reaching this code already requires an authenticated
// super_admin session, so the realistic threat is a guessing loop from one
// place. Same reasoning as lib/vault.ts.
const attempts = new Map<string, { count: number; firstAt: number }>();

function attemptsExhausted(adminId: string): boolean {
  const entry = attempts.get(adminId);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > LOCKOUT_MS) {
    attempts.delete(adminId);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(adminId: string): void {
  const entry = attempts.get(adminId);
  if (!entry || Date.now() - entry.firstAt > LOCKOUT_MS) {
    attempts.set(adminId, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

export type PasswordCheck =
  | { ok: true }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "incorrect" }
  | { ok: false; reason: "locked_out"; retryAfterMs: number };

/** Checks the maintenance password for an already-authorized super_admin. */
export function verifyMaintenancePassword(
  adminId: string,
  password: string
): PasswordCheck {
  const expected = readPassword();
  if (!expected) return { ok: false, reason: "not_configured" };

  if (attemptsExhausted(adminId)) {
    return { ok: false, reason: "locked_out", retryAfterMs: LOCKOUT_MS };
  }

  if (!password || !safeEqual(password, expected)) {
    recordFailure(adminId);
    return { ok: false, reason: "incorrect" };
  }

  attempts.delete(adminId);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
// Admin preview bypass
// ──────────────────────────────────────────────────────────────
// Whoever closed the site still needs to look at it. Rather than pay a
// getAdminContext() database round-trip on every visitor's page render, the
// toggle hands the admin a signed cookie that's verified with a cheap HMAC.
// It grants nothing except seeing the normal site during a maintenance window.

/**
 * Derived from the password so rotating MAINTENANCE_PASSWORD invalidates every
 * outstanding bypass, and mixed with the service-role key so the cookie can't
 * be forged from the password alone.
 */
function signingKey(password: string): Buffer {
  return createHash("sha256")
    .update(`maintenance:${password}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`)
    .digest();
}

/** `<expiryEpochSeconds>.<hmac>`. */
export function mintBypassToken(): string | null {
  const password = readPassword();
  if (!password) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + BYPASS_SESSION_SECONDS;
  const signature = createHmac("sha256", signingKey(password))
    .update(String(expiresAt))
    .digest("hex");
  return `${expiresAt}.${signature}`;
}

export function hasValidBypassToken(token: string | undefined): boolean {
  const password = readPassword();
  if (!password || !token) return false;

  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = createHmac("sha256", signingKey(password))
    .update(String(expiresAt))
    .digest("hex");
  return safeEqual(token.slice(separator + 1), expected);
}

export const BYPASS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

// ──────────────────────────────────────────────────────────────
// Writing the switch
// ──────────────────────────────────────────────────────────────

const DESCRIPTIONS: Record<string, string> = {
  maintenance_mode:
    "Site-wide kill switch. When true the customer site is closed and shows maintenance_message.",
  maintenance_message: "Copy shown to visitors while maintenance_mode is true.",
};

/**
 * Upsert rather than update, so the switch works even on a deployment whose
 * seed migration hasn't run. An `update` against a missing row reports success
 * while changing nothing — the worst possible failure for a control someone is
 * reaching for mid-incident.
 */
async function writeSetting(
  key: "maintenance_mode" | "maintenance_message",
  value: boolean | string,
  adminId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseAdmin.from("settings").upsert(
    {
      key,
      value,
      description: DESCRIPTIONS[key],
      updated_at: new Date().toISOString(),
      updated_by: adminId,
    },
    { onConflict: "key" }
  );

  if (error) {
    console.error(`[maintenance] Failed to write '${key}':`, error.message);
    return { ok: false, error: `Could not update ${key.replace(/_/g, " ")}.` };
  }

  invalidateMaintenanceCache();
  return { ok: true };
}

/**
 * Flips the switch. The caller is responsible for having already verified both
 * the admin's role and the password.
 */
export function setMaintenanceMode(enabled: boolean, adminId: string) {
  return writeSetting("maintenance_mode", enabled, adminId);
}

/** Updates the copy shown to visitors. Same authorization requirements as above. */
export function setMaintenanceMessage(message: string, adminId: string) {
  return writeSetting("maintenance_message", message, adminId);
}

// ──────────────────────────────────────────────────────────────
// Route guard
// ──────────────────────────────────────────────────────────────

/**
 * Call at the top of every customer-facing Route Handler:
 *
 *   const closed = await maintenanceGuard(request);
 *   if (closed) return closed;
 *
 * Returns a 503 while the site is closed, or null to continue. Admin routes
 * must NOT use this — they're what turns the switch back off.
 */
export async function maintenanceGuard(
  request: Request
): Promise<NextResponse | null> {
  const { enabled, message } = await getMaintenanceState();
  if (!enabled) return null;

  // Same bypass the pages honour, so an admin previewing the closed site
  // doesn't hit dead APIs behind a working-looking UI.
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${MAINTENANCE_BYPASS_COOKIE}=`))
    ?.slice(MAINTENANCE_BYPASS_COOKIE.length + 1);

  if (hasValidBypassToken(cookie ? decodeURIComponent(cookie) : undefined)) {
    return null;
  }

  return NextResponse.json(
    { error: message, maintenance: true },
    { status: 503, headers: { "Retry-After": "3600" } }
  );
}
