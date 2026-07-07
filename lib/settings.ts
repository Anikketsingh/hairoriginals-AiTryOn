/**
 * lib/settings.ts
 *
 * Reads platform configuration from the `settings` table in Supabase.
 *
 * Why this exists instead of process.env:
 *   All funnel numbers, gate messages, model names, etc. must be editable
 *   from the Admin Dashboard without a code deployment (context.md §2.3, §5.6).
 *   This helper abstracts that DB read behind a typed interface with a
 *   short in-memory cache to avoid hitting Postgres on every request.
 *
 * Cache TTL: 60 seconds. Acceptable for config values that change rarely.
 * Phase 4 admin dashboard will have a "Save" action that can also call
 * `invalidateSetting(key)` to force an immediate cache flush.
 *
 * Server-only — imports lib/supabase/server.ts.
 */

import { supabaseAdmin } from "@/lib/supabase/server";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

type SettingValue = string | number | boolean | null;

// Strongly-typed map of all known setting keys for IDE autocomplete.
// Add new keys here as new settings are added to the seed data.
export type SettingKey =
  | "guest_free_generations"
  | "registered_bonus_generations"
  | "agent_gate_enabled"
  | "login_gate_message"
  | "agent_gate_message"
  | "allow_agent_credit_grants"
  | "max_agent_grant_per_action"
  | "registered_monthly_refresh"
  | "gemini_model"
  | "max_upload_size_mb"
  | "agent_contact_channel"
  | "guest_gate_mode"
  | "agent_credits_default_expiry"
  | "content_manager_can_see_costs";

// ────────────────────────────────────────────────────────────────
// Cache
// ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 1 minute

const cache = new Map<string, { value: SettingValue; cachedAt: number }>();

function isCacheValid(entry: { cachedAt: number }): boolean {
  return Date.now() - entry.cachedAt < CACHE_TTL_MS;
}

/** Force-invalidate a single key (call from admin save handler in Phase 4). */
export function invalidateSetting(key: string): void {
  cache.delete(key);
}

/** Invalidate the entire settings cache (e.g. after a bulk settings update). */
export function invalidateAllSettings(): void {
  cache.clear();
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────

/**
 * Read a single setting by key.
 * Returns null if the key doesn't exist or the DB call fails.
 */
export async function getSetting(key: SettingKey): Promise<SettingValue> {
  const cached = cache.get(key);
  if (cached && isCacheValid(cached)) return cached.value;

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error || !data) {
    console.warn(`[settings] Could not read '${key}':`, error?.message ?? "not found");
    return null;
  }

  const value = data.value as SettingValue;
  cache.set(key, { value, cachedAt: Date.now() });
  return value;
}

/**
 * Read multiple settings in a single DB round-trip.
 * Missing or errored keys will be absent from the returned object.
 */
export async function getSettings(
  keys: SettingKey[]
): Promise<Partial<Record<SettingKey, SettingValue>>> {
  // Serve from cache where possible
  const result: Partial<Record<SettingKey, SettingValue>> = {};
  const missingKeys: SettingKey[] = [];

  for (const key of keys) {
    const cached = cache.get(key);
    if (cached && isCacheValid(cached)) {
      result[key] = cached.value;
    } else {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length === 0) return result;

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("key, value")
    .in("key", missingKeys);

  if (error || !data) {
    console.warn("[settings] Could not read settings:", error?.message ?? "unknown error");
    return result;
  }

  for (const row of data) {
    const key = row.key as SettingKey;
    const value = row.value as SettingValue;
    result[key] = value;
    cache.set(key, { value, cachedAt: Date.now() });
  }

  return result;
}

// ────────────────────────────────────────────────────────────────
// Typed convenience getters (used in Phase 1 funnel logic)
// ────────────────────────────────────────────────────────────────

export async function getGuestFreeGenerations(): Promise<number> {
  return (await getSetting("guest_free_generations") as number) ?? 1;
}

export async function getRegisteredBonusGenerations(): Promise<number> {
  return (await getSetting("registered_bonus_generations") as number) ?? 2;
}

export async function isAgentGateEnabled(): Promise<boolean> {
  return (await getSetting("agent_gate_enabled") as boolean) ?? true;
}

export async function getLoginGateMessage(): Promise<string> {
  return (
    (await getSetting("login_gate_message") as string) ??
    "Sign in to unlock more free try-ons."
  );
}

export async function getAgentGateMessage(): Promise<string> {
  return (
    (await getSetting("agent_gate_message") as string) ??
    "Talk to a HairOriginals stylist to unlock more try-ons."
  );
}

export async function getGeminiModel(): Promise<string> {
  return (
    (await getSetting("gemini_model") as string) ?? "gemini-3.1-flash-image"
  );
}

export async function getMaxUploadSizeMb(): Promise<number> {
  return (await getSetting("max_upload_size_mb") as number) ?? 10;
}
