#!/usr/bin/env node
/**
 * scripts/seed-home-trial-settings.mjs
 *
 * Applies supabase/migrations/20260820000001_home_trial_offer.sql — the twelve
 * `settings` rows behind the result-screen home trial offer — straight to the
 * linked project.
 *
 * Why this exists rather than `supabase db push`: the CLI wants Docker for its
 * local stack, and spinning that up here has taken the machine down. This
 * migration is pure INSERT ... ON CONFLICT DO NOTHING against one table, so it
 * can go through the same service-role client the app itself uses — no
 * containers, no shadow database, no local ports.
 *
 * Idempotent, exactly like the SQL: existing rows are left untouched, so an
 * admin's edits survive a re-run and a later `db push` is a no-op.
 *
 * Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env / .env.local.
 * Never prints them.
 *
 * Usage:
 *   node scripts/seed-home-trial-settings.mjs          # report only
 *   node scripts/seed-home-trial-settings.mjs --apply  # write
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(name) {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    // Skip commented-out lines: .env.local carries these keys as comments.
    const match = readFileSync(file, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

/** Mirrors the VALUES list in the migration, one-for-one. */
const ROWS = [
  ["home_trial_enabled", true,
   "Master switch for the home trial offer. False removes both the inline result-screen card and the popup."],
  ["home_trial_popup_enabled", true,
   "Controls only the timed popup. False keeps the inline card but stops the sheet from ever auto-opening."],
  ["home_trial_url", "https://www.hairoriginals.com/pages/try-at-home-new",
   "Booking page opened in a new tab. UTM params are appended client-side unless already present here."],
  ["home_trial_image_women", "/home-trial-banner.jpg",
   "Banner creative shown to customers on the women catalogue. A path under public/, or an uploaded Storage URL."],
  ["home_trial_image_men", "",
   "Banner creative for the men catalogue. Empty falls back to home_trial_image_women."],
  ["home_trial_cta_label", "Book a home trial",
   "Button and inline-card label. The home trial is a paid service — do not describe it as free."],
  ["home_trial_subtext", "A stylist brings the hair to you — try it on before you buy.",
   "One supporting line under the CTA label."],
  ["home_trial_badge", "At home",
   "Short pill above the CTA on the inline result-screen card. Empty string hides it."],
  ["home_trial_audience", "all",
   "Who sees the offer: all | women | men. Matched against the customer's Women/Men catalogue toggle."],
  ["home_trial_min_tryons", 1,
   "Try-ons a customer must have completed on this device before the popup may fire. 1 means every result; raise it to keep the first N clean."],
  ["home_trial_delay_ms", 4500,
   "Pause after the result renders before the popup opens, so the customer sees their own look first."],
  ["home_trial_once_per_session", false,
   "Cap the popup at one impression per browser session. False shows it after every result, subject to the other limits."],
  ["home_trial_stop_after_booking", true,
   "Stop showing the popup on a device once the customer has tapped through to the booking page. The inline card always remains."],
];

const url = loadEnv("SUPABASE_URL");
const key = loadEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env or .env.local.");
  process.exit(1);
}

/**
 * Rows seeded with copy that later turned out to be wrong.
 *
 * Only rewritten when the stored value still matches what was seeded — if an
 * admin has since edited the field, theirs wins and this leaves it alone. A
 * correction script that clobbers hand-written copy is worse than the typo.
 */
const CORRECTIONS = [
  // The home trial is a paid service; the launch copy wrongly called it free.
  ["home_trial_cta_label", "Book a free home trial", "Book a home trial"],
  [
    "home_trial_subtext",
    "A stylist brings the hair to you — free, no obligation.",
    "A stylist brings the hair to you — try it on before you buy.",
  ],
];

const apply = process.argv.includes("--apply");
const supabase = createClient(url, key, { auth: { persistSession: false } });

const keys = ROWS.map(([k]) => k);
const { data: existing, error: readErr } = await supabase
  .from("settings")
  .select("key, value")
  .in("key", keys);

if (readErr) {
  console.error("Could not read settings:", readErr.message);
  process.exit(1);
}

const current = new Map((existing ?? []).map((r) => [r.key, r.value]));
const missing = ROWS.filter(([k]) => !current.has(k));
const stale = CORRECTIONS.filter(([k, from]) => current.get(k) === from);

console.log(`settings rows for home_trial: ${current.size}/${ROWS.length} already present`);
for (const [k, v] of current) {
  const fix = stale.find(([key]) => key === k);
  if (fix) console.log(`  correct ${k}\n            from ${JSON.stringify(fix[1])}\n            to   ${JSON.stringify(fix[2])}`);
  else console.log(`  keep    ${k} = ${JSON.stringify(v)}`);
}
for (const [k, v] of missing) console.log(`  insert  ${k} = ${JSON.stringify(v)}`);

if (missing.length === 0 && stale.length === 0) {
  console.log("\nNothing to do.");
  process.exit(0);
}
if (!apply) {
  console.log("\nDry run. Re-run with --apply to write these changes.");
  process.exit(0);
}

if (missing.length > 0) {
  const { error } = await supabase
    .from("settings")
    .insert(missing.map(([key, value, description]) => ({ key, value, description })));
  if (error) {
    console.error("\nInsert failed:", error.message);
    process.exit(1);
  }
}

for (const [key, from, to] of stale) {
  // Re-checked in the WHERE clause, so a concurrent admin save can't be lost
  // between the read above and this write. `value` is JSONB, and a PostgREST
  // filter on it wants the JSON encoding — a bare string is a syntax error.
  const { error } = await supabase
    .from("settings")
    .update({ value: to })
    .eq("key", key)
    .eq("value", JSON.stringify(from));
  if (error) {
    console.error(`\nUpdate of ${key} failed:`, error.message);
    process.exit(1);
  }
}

const { data: after } = await supabase.from("settings").select("key, value").in("key", keys);
console.log(
  `\nInserted ${missing.length}, corrected ${stale.length}. Now present: ${(after ?? []).length}/${ROWS.length}`
);
