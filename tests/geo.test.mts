/**
 * tests/geo.test.mts
 *
 * The country the phone gate defaults to, and the dev-only override that makes
 * it observable off Vercel.
 *
 * Two things are worth locking down here. First, the override must be inert in
 * production: it is a debugging affordance sitting on the funnel step that
 * spends money, and "works in dev" is not evidence it is off in prod. Second,
 * the fallback chain in resolveDefaultCountry has to keep the <select> and its
 * <option> list in agreement — a default the picker doesn't offer renders as a
 * blank control that cannot be submitted.
 *
 * Unlike the other suites here, this one imports a module with a real runtime
 * dependency (lib/phone.ts pulls libphonenumber-js/mobile). That resolves
 * under plain Node because libphonenumber-js ships ESM with an `import`
 * condition for ./mobile, so no bundler is involved.
 *
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { resolveGeoCountry } from "../lib/geo.ts";

/**
 * SUPPORTED_COUNTRIES is filtered at module scope from
 * NEXT_PUBLIC_SMS_ALLOWED_COUNTRIES, so a hoisted import would freeze a single
 * allowlist for the whole file. Each variant is loaded up front with a
 * cache-busting query and captured before any test body runs, so no test can
 * mutate env that a later one depends on.
 */
async function loadPhone(allowlist: string, cacheKey: string) {
  process.env.NEXT_PUBLIC_SMS_ALLOWED_COUNTRIES = allowlist;
  return import(`../lib/phone.ts?case=${cacheKey}`);
}

const LIVE = await loadPhone("IN,US,CA,GB,DE,ES,FR,IE,NL,SE", "live");
const NO_INDIA = await loadPhone("US,CA", "noIndia");

test("override replaces the header when development allows it", () => {
  assert.equal(resolveGeoCountry(null, "US", true), "US");
  assert.equal(resolveGeoCountry("IN", "US", true), "US");
  // Typing ?geo=us should not be a silent no-op.
  assert.equal(resolveGeoCountry(null, "us", true), "US");
  assert.equal(resolveGeoCountry(null, "cA", true), "CA");
});

test("override is inert in production", () => {
  // The branch that must never regress: on Vercel the real header is the only
  // thing that may decide the country, whatever the query string says.
  assert.equal(resolveGeoCountry("IN", "US", false), "IN");
  assert.equal(resolveGeoCountry(null, "US", false), null);
  assert.equal(resolveGeoCountry("CA", "gb", false), "CA");
});

test("malformed overrides fall through to the header, not to null", () => {
  // Swallowing junk into null would pin the picker to the fallback and look
  // identical to the geo detection being broken.
  for (const junk of ["", "U", "USA", "u$", "12", "  ", "U S"]) {
    assert.equal(resolveGeoCountry("IN", junk, true), "IN", JSON.stringify(junk));
    assert.equal(resolveGeoCountry(null, junk, true), null, JSON.stringify(junk));
  }
  assert.equal(resolveGeoCountry("IN", null, true), "IN");
  assert.equal(resolveGeoCountry("IN", undefined, true), "IN");
});

test("served countries pass through to the picker", () => {
  for (const iso of ["IN", "US", "CA", "GB", "DE", "ES", "FR", "IE", "NL", "SE"]) {
    assert.equal(LIVE.resolveDefaultCountry(iso), iso, iso);
  }
  // Vercel sends uppercase, but nothing in the chain guarantees it.
  assert.equal(LIVE.resolveDefaultCountry("us"), "US");
  assert.equal(LIVE.resolveDefaultCountry("ca"), "CA");
});

test("countries we don't serve fall back to India", () => {
  // Deliberate: no region-mapping table. A visitor from any of these is
  // rejected by SMS_ALLOWED_COUNTRIES server-side regardless of what the
  // picker shows, so mapping JP→SG would add a table to maintain and change
  // nothing about whether they can sign up.
  for (const iso of ["JP", "BR", "AU", "ZZ", "SG", "AE", ""]) {
    assert.equal(LIVE.resolveDefaultCountry(iso), "IN", JSON.stringify(iso));
  }
  assert.equal(LIVE.resolveDefaultCountry(null), "IN");
  assert.equal(LIVE.resolveDefaultCountry(undefined), "IN");
});

test("falls back to an offered country when India is not one", () => {
  // REGRESSION: a naive fallback returns DEFAULT_COUNTRY unconditionally. With
  // India filtered out of the allowlist that yields a <select value="IN"> with
  // no matching <option> — a blank picker that cannot be submitted.
  assert.equal(NO_INDIA.resolveDefaultCountry(null), "US");
  assert.equal(NO_INDIA.resolveDefaultCountry("IN"), "US");
  assert.equal(NO_INDIA.resolveDefaultCountry("CA"), "CA");
  assert.deepEqual(
    NO_INDIA.SUPPORTED_COUNTRIES.map((c: { iso: string }) => c.iso),
    ["US", "CA"],
  );
});

test("override and fallback compose the way the layout uses them", () => {
  // The full dev path: ?geo=us on localhost, where the header is absent.
  assert.equal(
    LIVE.resolveDefaultCountry(resolveGeoCountry(null, "us", true)),
    "US",
  );
  // The same request in production.
  assert.equal(
    LIVE.resolveDefaultCountry(resolveGeoCountry(null, "us", false)),
    "IN",
  );
  // An unserved override still degrades without a second allowlist in lib/geo.
  assert.equal(
    LIVE.resolveDefaultCountry(resolveGeoCountry(null, "jp", true)),
    "IN",
  );
});
