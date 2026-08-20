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
import { DEFAULT_GEMINI_MODEL } from "@/lib/gemini-models";
import type { HomeTrialAudience, HomeTrialConfig } from "@/lib/types";

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
  | "content_manager_can_see_costs"
  | "customization_enabled"
  // Result-screen home trial offer — see getHomeTrialConfig() below.
  | "home_trial_enabled"
  | "home_trial_popup_enabled"
  | "home_trial_url"
  | "home_trial_image_women"
  | "home_trial_image_men"
  | "home_trial_cta_label"
  | "home_trial_subtext"
  | "home_trial_badge"
  | "home_trial_audience"
  | "home_trial_min_tryons"
  | "home_trial_delay_ms"
  | "home_trial_once_per_session"
  | "home_trial_stop_after_booking"
  // Read and written through lib/maintenance.ts rather than the helpers below:
  // the switch needs a far shorter cache TTL than this module's 60s, and its
  // writes require MAINTENANCE_PASSWORD on top of a super_admin session.
  | "maintenance_mode"
  | "maintenance_message";

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

/** Whether Stage 4 (manual agent credit grants) is available at all. */
export async function areAgentCreditGrantsAllowed(): Promise<boolean> {
  return (await getSetting("allow_agent_credit_grants") as boolean) ?? true;
}

/** Maximum credits a sales agent can grant to a customer in a single admin action. */
export async function getMaxAgentGrantPerAction(): Promise<number> {
  return (await getSetting("max_agent_grant_per_action") as number) ?? 5;
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
  return (await getSetting("gemini_model") as string) ?? DEFAULT_GEMINI_MODEL;
}

export async function getMaxUploadSizeMb(): Promise<number> {
  return (await getSetting("max_upload_size_mb") as number) ?? 10;
}

/** Fleet-wide kill switch for Hair Colour / Hair Length customization. */
export async function isCustomizationEnabled(): Promise<boolean> {
  return (await getSetting("customization_enabled") as boolean) ?? true;
}

// ────────────────────────────────────────────────────────────────
// Home trial offer
// ────────────────────────────────────────────────────────────────

const HOME_TRIAL_KEYS: SettingKey[] = [
  "home_trial_enabled",
  "home_trial_popup_enabled",
  "home_trial_url",
  "home_trial_image_women",
  "home_trial_image_men",
  "home_trial_cta_label",
  "home_trial_subtext",
  "home_trial_badge",
  "home_trial_audience",
  "home_trial_min_tryons",
  "home_trial_delay_ms",
  "home_trial_once_per_session",
  "home_trial_stop_after_booking",
];

const HOME_TRIAL_DEFAULTS = {
  url: "https://www.hairoriginals.com/pages/try-at-home-new",
  imageWomen: "/home-trial-banner.jpg",
  ctaLabel: "Book a home trial",
  subtext: "A stylist brings the hair to you — try it on before you buy.",
  badge: "At home",
  minTryons: 1,
  delayMs: 4500,
} as const;

/** Coerce a stored value that should be a non-empty string, else the fallback. */
function settingString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Coerce a stored value that should be a finite number, else the fallback. */
function settingNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The result-screen home trial offer, in one DB round-trip.
 *
 * Both creatives come back and the client picks by catalogue gender (see the
 * note on HomeTrialConfig). The men slot is seeded empty and falls back to the
 * women artwork here, so the offer never renders with a missing image while a
 * men's banner is still being designed.
 *
 * Every field has a hardcoded fallback, so a missing settings row degrades to
 * a working offer rather than a broken one — matching the getters above.
 */
export async function getHomeTrialConfig(): Promise<HomeTrialConfig> {
  const s = await getSettings(HOME_TRIAL_KEYS);

  const women = settingString(s.home_trial_image_women, HOME_TRIAL_DEFAULTS.imageWomen);
  const men = settingString(s.home_trial_image_men, women);

  const audienceRaw = settingString(s.home_trial_audience, "all");
  const audience: HomeTrialAudience =
    audienceRaw === "women" || audienceRaw === "men" ? audienceRaw : "all";

  return {
    enabled: (s.home_trial_enabled as boolean) ?? true,
    popupEnabled: (s.home_trial_popup_enabled as boolean) ?? true,
    url: settingString(s.home_trial_url, HOME_TRIAL_DEFAULTS.url),
    imageWomen: women,
    imageMen: men,
    ctaLabel: settingString(s.home_trial_cta_label, HOME_TRIAL_DEFAULTS.ctaLabel),
    subtext: settingString(s.home_trial_subtext, HOME_TRIAL_DEFAULTS.subtext),
    // Unlike the others this may legitimately be blank, which hides the pill —
    // so it can't go through settingString, which treats "" as "use the default".
    badge: typeof s.home_trial_badge === "string" ? s.home_trial_badge.trim() : HOME_TRIAL_DEFAULTS.badge,
    audience,
    // Clamped: a 0 would fire the popup on the very first try-on, and a
    // negative or absurd delay would either flash over the result or never
    // arrive. Both are easy mis-entries in a free-text admin field.
    minTryons: Math.max(1, Math.round(settingNumber(s.home_trial_min_tryons, HOME_TRIAL_DEFAULTS.minTryons))),
    delayMs: Math.min(60_000, Math.max(0, Math.round(settingNumber(s.home_trial_delay_ms, HOME_TRIAL_DEFAULTS.delayMs)))),
    // Both default off/on to "show on every result, but stop once she books" —
    // the popup is the conversion ask, the inline card is the quiet path.
    oncePerSession: (s.home_trial_once_per_session as boolean) ?? false,
    stopAfterBooking: (s.home_trial_stop_after_booking as boolean) ?? true,
  };
}
