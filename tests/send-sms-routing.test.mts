/**
 * tests/send-sms-routing.test.ts
 *
 * Country resolution and allowlisting for the send_sms auth hook.
 *
 * These live in the repo rather than a scratch file because this module decides
 * where money can be spent, and because a throwaway suite is exactly what let a
 * production outage through: every earlier test fed "+919876543210", while
 * Supabase actually hands the hook bare digits ("919876543210"). The suite was
 * green and the feature was broken.
 *
 * routing.ts is pure TypeScript with no Deno APIs, so it runs under Node.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeE164,
  parseAllowlist,
  providerFor,
  resolveCountry,
} from "../supabase/functions/send-sms/routing.ts";

test("resolves the bare-digit payload Supabase actually sends", () => {
  // REGRESSION: the shipped code began `if (!e164.startsWith("+")) return null`,
  // so every one of these resolved to null → 400 → Auth surfaced 500.
  assert.equal(resolveCountry("919876543210"), "IN");
  assert.equal(resolveCountry("918950000000"), "IN");
  assert.equal(resolveCountry("14155552671"), "US");
  assert.equal(resolveCountry("447400123456"), "GB");
  assert.equal(resolveCountry("971501234567"), "AE");
});

test("both phone forms resolve identically", () => {
  for (const [plus, bare] of [
    ["+919876543210", "919876543210"],
    ["+14155552671", "14155552671"],
    ["+447400123456", "447400123456"],
    ["+971501234567", "971501234567"],
    ["+18765550123", "18765550123"],
  ]) {
    assert.equal(resolveCountry(plus), resolveCountry(bare), `${plus} vs ${bare}`);
  }
});

test("resolves target markets", () => {
  const cases: [string, string][] = [
    ["+919876543210", "IN"], ["+14155550123", "US"], ["+14165550123", "US"],
    ["+447700900123", "GB"], ["+4915112345678", "DE"], ["+971501234567", "AE"],
    ["+6591234567", "SG"], ["+60123456789", "MY"], ["+6281234567890", "ID"],
    ["+353871234567", "IE"],
  ];
  for (const [phone, iso] of cases) assert.equal(resolveCountry(phone), iso, phone);
});

test("longest-prefix wins (the +97x trap)", () => {
  // +97 is not a country, but +971/+972/+974/+977 all are. A naive
  // shortest-match would route all of them to whichever was checked first.
  assert.equal(resolveCountry("+971501234567"), "AE");
  assert.equal(resolveCountry("+972501234567"), "IL");
  assert.equal(resolveCountry("+97455123456"), "QA");
  assert.equal(resolveCountry("+9779812345678"), "NP");
  assert.equal(resolveCountry("+8801712345678"), "BD");
});

test("Caribbean +1 territories do NOT resolve as US", () => {
  // The +1 space is shared with ~25 territories carrying premium-rate ranges —
  // a classic SMS-pumping vector. Allowlisting "US" must not admit them.
  assert.equal(resolveCountry("+18765550123"), "JM");
  assert.equal(resolveCountry("+18095550123"), "DO");
  assert.equal(resolveCountry("+18685550123"), "TT");
  assert.equal(resolveCountry("+14735550123"), "GD");
  assert.equal(resolveCountry("+12845550123"), "VG");
  assert.equal(resolveCountry("+16495550123"), "TC");
});

test("fails closed on unresolvable input", () => {
  assert.equal(resolveCountry("+99912345678"), null);
  assert.equal(resolveCountry(""), null);
  assert.equal(resolveCountry("+"), null);
  assert.equal(resolveCountry("+12"), null); // too short for a NANP area code
});

test("normalizeE164 canonicalises to +digits", () => {
  assert.equal(normalizeE164("919876543210"), "+919876543210");
  assert.equal(normalizeE164("+919876543210"), "+919876543210");
  assert.equal(normalizeE164("+91 98765-43210"), "+919876543210");
  assert.equal(normalizeE164(""), null);
  assert.equal(normalizeE164(undefined), null);
  assert.equal(normalizeE164("abc"), null);
});

test("allowlist denies by default", () => {
  // An unset or empty allowlist must reject everything rather than open
  // delivery worldwide — a misconfigured deploy should stop sending, not spend.
  assert.equal(parseAllowlist(undefined).size, 0);
  assert.equal(parseAllowlist("").size, 0);
  assert.deepEqual([...parseAllowlist("IN, us ,GB")].sort(), ["GB", "IN", "US"]);
});

test("allowlist blocks non-target countries in both phone forms", () => {
  const allow = parseAllowlist("IN");
  for (const phone of ["+919876543210", "919876543210"]) {
    assert.equal(allow.has(resolveCountry(phone)!), true, phone);
  }
  for (const phone of ["+447400123456", "447400123456", "+18765550123", "18765550123"]) {
    assert.equal(allow.has(resolveCountry(phone)!), false, phone);
  }
});

test("routes India by config, everything else to Twilio", () => {
  assert.equal(providerFor("IN", "nimbus"), "nimbus");
  assert.equal(providerFor("IN", "twilio"), "twilio");
  assert.equal(providerFor("US", "nimbus"), "twilio");
  assert.equal(providerFor("GB", "nimbus"), "twilio");
  assert.equal(providerFor("AE", "twilio"), "twilio");
});
