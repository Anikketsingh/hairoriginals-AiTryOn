#!/usr/bin/env node
/**
 * scripts/raise-registered-trial-quota.mjs
 *
 * Applies supabase/migrations/20260828000001_raise_registered_trial_quota.sql —
 * raising the signed-in try-on quota to 10000 for EXISTING users, not just new
 * signups — straight to the linked project.
 *
 * Why this exists rather than `supabase db push`: the CLI wants Docker for its
 * local stack and has taken this machine down before, and `db push` writes to
 * the production database. This migration is pure INSERT/UPDATE against two
 * tables, so it goes through the same service-role client the app itself uses.
 *
 * Idempotent: rows already at or above the target are left alone, so a re-run
 * (or a later `db push` of the .sql) is a no-op.
 *
 * Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env / .env.local.
 * Never prints them.
 *
 * Usage:
 *   node scripts/raise-registered-trial-quota.mjs          # report only
 *   node scripts/raise-registered-trial-quota.mjs --apply  # write
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const QUOTA = 10000;

function loadEnv(name) {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    // Skip commented-out lines: .env.local carries these keys as comments.
    const match = readFileSync(file, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

const url = loadEnv("SUPABASE_URL");
const key = loadEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env or .env.local.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** PostgREST caps a response at 1000 rows; page through so large tables are complete. */
async function fetchAll(table, select, filter) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(select).order("id").range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) {
      console.error(`Could not read ${table}:`, error.message);
      process.exit(1);
    }
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

// ── 1. The setting, for all future signups ──────────────────────
const { data: settingRows, error: settingErr } = await supabase
  .from("settings")
  .select("key, value")
  .in("key", ["registered_bonus_generations", "login_gate_message"]);

if (settingErr) {
  console.error("Could not read settings:", settingErr.message);
  process.exit(1);
}
const settings = new Map((settingRows ?? []).map((r) => [r.key, r.value]));
const bonusSetting = settings.get("registered_bonus_generations");
const needsSetting = bonusSetting !== QUOTA;

// ── 2. Existing registered_bonus rows below the target ──────────
const bonusRows = await fetchAll("generation_credits", "id, user_id, amount, consumed", (q) =>
  q.eq("source", "registered_bonus").not("user_id", "is", null)
);
const toRaise = bonusRows.filter((r) => r.amount < QUOTA);

// ── 3. Registered users with no registered_bonus row at all ─────
const users = await fetchAll("users", "id");
const haveBonus = new Set(bonusRows.map((r) => r.user_id));
const toInsert = users.filter((u) => !haveBonus.has(u.id));

// ── 4. Gate copy, only if it still matches the 5-try-on wording ──
// An admin's own edit wins; a correction that clobbers hand-written copy is
// worse than the stale number.
const OLD_GATE = "Loved how that looked? Sign in to unlock 5 more free try-ons.";
const NEW_GATE = "Loved how that looked? Sign in to unlock unlimited free try-ons.";
const needsGate = settings.get("login_gate_message") === OLD_GATE;

console.log(`registered_bonus_generations : ${JSON.stringify(bonusSetting)}` +
  (needsSetting ? ` -> ${QUOTA}` : "  (already correct)"));
console.log(`login_gate_message           : ` +
  (needsGate ? `-> "unlimited free try-ons"` : "left as-is (edited or already updated)"));
console.log(`registered users             : ${users.length}`);
console.log(`registered_bonus rows        : ${bonusRows.length}`);
console.log(`  raise to ${QUOTA}             : ${toRaise.length}`);
console.log(`  already >= ${QUOTA}           : ${bonusRows.length - toRaise.length}`);
console.log(`users missing a bonus row    : ${toInsert.length} (will be inserted)`);

if (toRaise.length > 0) {
  const spent = toRaise.reduce((s, r) => s + r.consumed, 0);
  console.log(`\nconsumed on rows being raised: ${spent} (preserved — only 'amount' changes)`);
}

if (!needsSetting && !needsGate && toRaise.length === 0 && toInsert.length === 0) {
  console.log("\nNothing to do.");
  process.exit(0);
}
if (!apply) {
  console.log("\nDry run. Re-run with --apply to write these changes.");
  process.exit(0);
}

// ── writes ──────────────────────────────────────────────────────
if (needsSetting) {
  const { error } = await supabase
    .from("settings")
    .update({ value: QUOTA })
    .eq("key", "registered_bonus_generations");
  if (error) {
    console.error("\nSetting update failed:", error.message);
    process.exit(1);
  }
}

if (needsGate) {
  // Re-checked in the filter so a concurrent admin save can't be lost between
  // the read above and this write. `value` is JSONB, so the filter needs the
  // JSON encoding — a bare string is a syntax error.
  const { error } = await supabase
    .from("settings")
    .update({ value: NEW_GATE })
    .eq("key", "login_gate_message")
    .eq("value", JSON.stringify(OLD_GATE));
  if (error) {
    console.error("\nGate copy update failed:", error.message);
    process.exit(1);
  }
}

// Batched by id: every row gets the same literal amount, and `consumed` is
// untouched, so each user keeps the try-ons they've already spent.
for (let i = 0; i < toRaise.length; i += 500) {
  const ids = toRaise.slice(i, i + 500).map((r) => r.id);
  const { error } = await supabase.from("generation_credits").update({ amount: QUOTA }).in("id", ids);
  if (error) {
    console.error("\nCredit raise failed:", error.message);
    process.exit(1);
  }
}

for (let i = 0; i < toInsert.length; i += 500) {
  const rows = toInsert.slice(i, i + 500).map((u) => ({
    user_id: u.id,
    source: "registered_bonus",
    amount: QUOTA,
    consumed: 0,
  }));
  const { error } = await supabase.from("generation_credits").insert(rows);
  if (error) {
    console.error("\nBackfill insert failed:", error.message);
    process.exit(1);
  }
}

// ── verify ──────────────────────────────────────────────────────
const after = await fetchAll("generation_credits", "id, amount", (q) =>
  q.eq("source", "registered_bonus").not("user_id", "is", null)
);
const short = after.filter((r) => r.amount < QUOTA).length;
const { data: settingAfter } = await supabase
  .from("settings")
  .select("value")
  .eq("key", "registered_bonus_generations")
  .single();

console.log(`\nRaised ${toRaise.length}, inserted ${toInsert.length}.`);
console.log(`registered_bonus rows now: ${after.length}, of which below ${QUOTA}: ${short}`);
console.log(`registered_bonus_generations = ${JSON.stringify(settingAfter?.value)}`);
