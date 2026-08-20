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
    ["+919876543210", "IN"], ["+14155550123", "US"], ["+14165550123", "CA"],
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

test("Canada resolves as CA, not US", () => {
  // REGRESSION: resolveCountry used to return "US" for every non-Caribbean +1,
  // which made "CA" in SMS_ALLOWED_COUNTRIES a value that could never be
  // produced — dead config that silently allowlisted Canada via "US".
  assert.equal(resolveCountry("+14165550123"), "CA"); // Toronto
  assert.equal(resolveCountry("+16045550123"), "CA"); // Vancouver
  assert.equal(resolveCountry("+15145550123"), "CA"); // Montreal
  assert.equal(resolveCountry("+14035550123"), "CA"); // Calgary
  assert.equal(resolveCountry("+19025550123"), "CA"); // Halifax
  assert.equal(resolveCountry("+18675550123"), "CA"); // Territories
  assert.equal(resolveCountry("14165550123"), "CA"); // bare-digit form too
});

test("US still resolves as US", () => {
  assert.equal(resolveCountry("+12125550123"), "US"); // New York
  assert.equal(resolveCountry("+14155550123"), "US"); // San Francisco
  assert.equal(resolveCountry("+13125550123"), "US"); // Chicago
  assert.equal(resolveCountry("+17135550123"), "US"); // Houston
  // Unassigned/new NPAs fall through to US rather than failing closed, which is
  // the deliberate default for the +1 space.
  assert.equal(resolveCountry("+15555550123"), "US");
});

test("US and Canada are independently allowlistable", () => {
  // The whole point of the CA split: launching the US must not silently launch
  // Canada, whose carriers filter A2P long-code traffic on entirely different
  // rules and where a healthy US sender can still be blocked.
  const usOnly = parseAllowlist("IN,US");
  assert.equal(usOnly.has(resolveCountry("+12125550123")!), true);
  assert.equal(usOnly.has(resolveCountry("+14165550123")!), false, "Toronto must be blocked by IN,US");

  const caOnly = parseAllowlist("IN,CA");
  assert.equal(caOnly.has(resolveCountry("+14165550123")!), true);
  assert.equal(caOnly.has(resolveCountry("+12125550123")!), false, "New York must be blocked by IN,CA");

  const both = parseAllowlist("IN,US,CA");
  assert.equal(both.has(resolveCountry("+12125550123")!), true);
  assert.equal(both.has(resolveCountry("+14165550123")!), true);
  // Widening to North America must NOT admit the Caribbean +1 ranges.
  assert.equal(both.has(resolveCountry("+18765550123")!), false, "Jamaica must stay blocked");
});

test("the three NANP sets are disjoint", () => {
  // A code appearing in both CANADA_AREA_CODES and NON_US_CA_NANP would make
  // resolution order-dependent, so assert the property through the public API:
  // no +1 number may resolve to more than one country, and territories win.
  for (const [phone, iso] of [
    ["+18765550123", "JM"], ["+16585550123", "JM"], ["+14415550123", "BM"],
    ["+16495550123", "TC"], ["+14735550123", "GD"],
  ] as [string, string][]) {
    assert.equal(resolveCountry(phone), iso, `${phone} must stay a territory, not CA/US`);
  }
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
