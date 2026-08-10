/**
 * lib/vault.ts
 *
 * Authorization for the image vault — the owner-only bulk view/export of every
 * customer photo and generated look (/admin/vault/<VAULT_PATH_KEY>).
 *
 * This surface hands over the raw contents of the two private buckets in one
 * archive: `sources` holds photographs of customers' faces. That's a far
 * heavier grant than any other admin screen, so it sits behind four
 * independent gates rather than the usual one:
 *
 *   1. A Supabase session, enforced early by proxy.ts.
 *   2. `super_admin` in `admin_users`, enforced by lib/admin-auth.ts — and, if
 *      VAULT_OWNER_EMAIL is set, that one account specifically.
 *   3. An unguessable URL segment (VAULT_PATH_KEY). A wrong or absent segment
 *      renders a plain 404, so the route is indistinguishable from a page that
 *      doesn't exist — it never appears in the admin nav for anyone else.
 *   4. A separate password (VAULT_PASSWORD), exchanged for a short-lived
 *      signed cookie. Not a substitute for the session — an unlocked laptop
 *      with a live admin session still can't bulk-export without it.
 *
 * Fails closed: if VAULT_PATH_KEY or VAULT_PASSWORD is unset the whole vault
 * 404s, so a half-configured deployment exposes nothing.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin, type AdminContext } from "@/lib/admin-auth";

export const VAULT_COOKIE = "ho_vault";

/**
 * How long one unlock lasts. Short on purpose — the cookie authorizes bulk
 * export of customer face photos, so it should not outlive the sitting.
 */
export const VAULT_SESSION_SECONDS = 30 * 60;

/** Wrong-password attempts allowed per admin before a cooldown. */
const MAX_UNLOCK_ATTEMPTS = 5;
const UNLOCK_LOCKOUT_MS = 15 * 60 * 1000;

interface VaultConfig {
  pathKey: string;
  password: string;
  ownerEmail: string | null;
}

function readConfig(): VaultConfig | null {
  const pathKey = process.env.VAULT_PATH_KEY;
  const password = process.env.VAULT_PASSWORD;
  if (!pathKey || !password) return null;
  return {
    pathKey,
    password,
    ownerEmail: process.env.VAULT_OWNER_EMAIL?.trim().toLowerCase() || null,
  };
}

/** True when the vault is configured at all. */
export function isVaultEnabled(): boolean {
  return readConfig() !== null;
}

/**
 * The secret URL segment, or null when the vault is disabled. Server-only
 * callers: this is handed to the browser solely for the owner's own nav link.
 */
export function getVaultPathKey(): string | null {
  return readConfig()?.pathKey ?? null;
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

/**
 * Key for the unlock cookie's signature. Derived from the password so that
 * rotating VAULT_PASSWORD invalidates every outstanding unlock, and mixed with
 * the service-role key so the cookie can't be forged from the password alone.
 */
function signingKey(config: VaultConfig): Buffer {
  return createHash("sha256")
    .update(`vault:${config.password}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`)
    .digest();
}

/** Is this admin allowed to see the vault at all, before any password check? */
function isVaultOwner(admin: AdminContext, config: VaultConfig): boolean {
  if (admin.role !== "super_admin") return false;
  if (!config.ownerEmail) return true;
  return admin.email.trim().toLowerCase() === config.ownerEmail;
}

/**
 * The vault's URL for this admin, or null if it isn't theirs. The admin shell
 * uses this to decide whether to wire up its hidden entry point at all — for
 * everyone else the secret path never reaches the browser.
 */
export function vaultNavPathFor(admin: AdminContext): string | null {
  const config = readConfig();
  if (!config || !isVaultOwner(admin, config)) return null;
  return `/admin/vault/${encodeURIComponent(config.pathKey)}`;
}

// ──────────────────────────────────────────────────────────────
// Unlock attempts
// ──────────────────────────────────────────────────────────────
// Per-instance and therefore only a speed bump on a distributed attacker —
// but reaching this code already requires an authenticated super_admin
// session, so the realistic threat is a guessing loop from one place.

const unlockAttempts = new Map<string, { count: number; firstAt: number }>();

function attemptsExhausted(adminId: string): boolean {
  const entry = unlockAttempts.get(adminId);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > UNLOCK_LOCKOUT_MS) {
    unlockAttempts.delete(adminId);
    return false;
  }
  return entry.count >= MAX_UNLOCK_ATTEMPTS;
}

function recordFailedAttempt(adminId: string): void {
  const entry = unlockAttempts.get(adminId);
  if (!entry || Date.now() - entry.firstAt > UNLOCK_LOCKOUT_MS) {
    unlockAttempts.set(adminId, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

// ──────────────────────────────────────────────────────────────
// Unlock tokens
// ──────────────────────────────────────────────────────────────

/** `<expiryEpochSeconds>.<hmac>`, bound to the admin who unlocked. */
function mintToken(admin: AdminContext, config: VaultConfig): string {
  const expiresAt = Math.floor(Date.now() / 1000) + VAULT_SESSION_SECONDS;
  const signature = createHmac("sha256", signingKey(config))
    .update(`${admin.id}.${expiresAt}`)
    .digest("hex");
  return `${expiresAt}.${signature}`;
}

function tokenIsValid(token: string, admin: AdminContext, config: VaultConfig): boolean {
  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = createHmac("sha256", signingKey(config))
    .update(`${admin.id}.${expiresAt}`)
    .digest("hex");
  return safeEqual(token.slice(separator + 1), expected);
}

// ──────────────────────────────────────────────────────────────
// Route guards
// ──────────────────────────────────────────────────────────────

/**
 * Everything a vault route needs before it will touch storage: the vault is
 * configured, the URL segment is right, the caller is the owner, and they've
 * unlocked in the last VAULT_SESSION_SECONDS.
 *
 * `locked: true` in the 401 body is what tells the UI to show the password
 * prompt rather than bouncing to the login screen.
 */
export async function requireVaultAccess(
  pathKey: string,
  unlockCookie: string | undefined
): Promise<AdminContext | NextResponse> {
  const gate = await requireVaultOwner(pathKey);
  if (gate instanceof NextResponse) return gate;

  const config = readConfig()!;
  if (!unlockCookie || !tokenIsValid(unlockCookie, gate, config)) {
    return NextResponse.json(
      { error: "Vault is locked.", locked: true },
      { status: 401 }
    );
  }
  return gate;
}

/**
 * Slides the unlock forward on an authorized request, so the 30-minute window
 * measures idleness rather than total session length.
 *
 * Without this, a bulk export of the whole library — which can legitimately run
 * for hours, and keeps paging this API for fresh signed URLs — would be cut off
 * mid-archive by its own unlock expiring. Walking away still locks the vault
 * within VAULT_SESSION_SECONDS, because nothing is being requested.
 */
export function refreshVaultUnlock<T extends NextResponse>(
  response: T,
  admin: AdminContext
): T {
  const config = readConfig();
  if (!config) return response;

  response.cookies.set(VAULT_COOKIE, mintToken(admin, config), {
    ...VAULT_COOKIE_OPTIONS,
    maxAge: VAULT_SESSION_SECONDS,
  });
  return response;
}

/**
 * The first three gates, without the password. Used by the unlock route
 * itself (which has no cookie yet) and by the page shell.
 *
 * Every failure is a bare 404: someone probing for the vault can't tell a
 * wrong path key from a right one they aren't allowed to use.
 */
export async function requireVaultOwner(
  pathKey: string
): Promise<AdminContext | NextResponse> {
  const config = readConfig();
  const notFound = NextResponse.json({ error: "Not found." }, { status: 404 });

  if (!config || !safeEqual(pathKey, config.pathKey)) return notFound;

  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return notFound;
  if (!isVaultOwner(admin, config)) return notFound;

  return admin;
}

/** Same three gates for the server-rendered page, as a boolean. */
export async function canOpenVault(pathKey: string): Promise<boolean> {
  return !((await requireVaultOwner(pathKey)) instanceof NextResponse);
}

/**
 * Checks the vault password for an already-authorized owner and, on success,
 * returns the cookie value to set. Returns null on a wrong password or once
 * the attempt budget is spent.
 */
export function unlockVault(
  admin: AdminContext,
  password: string
): { token: string } | { retryAfterMs: number } | null {
  const config = readConfig();
  if (!config) return null;

  if (attemptsExhausted(admin.id)) {
    return { retryAfterMs: UNLOCK_LOCKOUT_MS };
  }

  if (!password || !safeEqual(password, config.password)) {
    recordFailedAttempt(admin.id);
    return null;
  }

  unlockAttempts.delete(admin.id);
  return { token: mintToken(admin, config) };
}

/** Cookie attributes shared by the set and clear paths. */
export const VAULT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;
