/**
 * tests/attribution.test.mts
 *
 * First-touch marketing attribution parsing and the replace rule.
 *
 * These are worth pinning because the values are unrecoverable: the params exist
 * only on the landing URL, we keep no copy in our own database, and the lead
 * they belong to may not be created for days. A parse bug is silent — leads keep
 * flowing to the CRM, just permanently unattributed.
 *
 * lib/attribution.ts imports only a type from next/server, which strips away, so
 * it runs under plain Node.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ATTR_COOKIE,
  deserializeAttribution,
  parseAttribution,
  readAttributionCookie,
  readClientAttribution,
  serializeAttribution,
  shouldReplace,
  writeClientAttribution,
  type Attribution,
} from "../lib/attribution.ts";

/**
 * Minimal stand-in for the browser cookie jar: assignment sets one cookie, the
 * getter returns them all joined. Enough to exercise the real read/write pair
 * (including the name-matching regex) without pulling in a DOM library.
 */
function installCookieJar(): { clear: () => void } {
  const jar = new Map<string, string>();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    get: () => ({
      get cookie() {
        return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      },
      set cookie(raw: string) {
        const [pair] = raw.split(";");
        const eq = pair.indexOf("=");
        jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
      },
    }),
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    get: () => ({ location: { protocol: "https:" } }),
  });
  return { clear: () => jar.clear() };
}

/** The exact params from a live HairOriginals Meta ad (see the CRM screenshot). */
const AD_SEARCH =
  "?utm_source=HO-HT-Female-Kolkata-WLP-static" +
  "&utm_medium=Facebook_Mobile_Feed" +
  "&utm_campaign=HO-HT-Female-Kolkata-WLP-static" +
  "&utm_content=HO-HT-Female-Kolkata-WLP-static" +
  "&utm_term=120248613941970339" +
  "&campaign_id=120248613941980339" +
  "&ad_id=120256558077390339" +
  "&fbclid=IwcGRvZgNleHRuA2FlbQEwAGFkaWQBqzz59OhVk3NydGMGYXBwX2lk";

const AD_URL = `https://aitryon.hairoriginals.com/${AD_SEARCH}`;

test("maps every marketing param off a real Meta ad URL", () => {
  const attr = parseAttribution(AD_SEARCH, "https://l.facebook.com/", AD_URL);

  assert.equal(attr.utm_source, "HO-HT-Female-Kolkata-WLP-static");
  assert.equal(attr.utm_medium, "Facebook_Mobile_Feed");
  assert.equal(attr.utm_campaign, "HO-HT-Female-Kolkata-WLP-static");
  assert.equal(attr.utm_content, "HO-HT-Female-Kolkata-WLP-static");
  assert.equal(attr.utm_term, "120248613941970339");
  assert.equal(attr.campaign_id, "120248613941980339");
  assert.equal(attr.ad_id, "120256558077390339");
  assert.equal(attr.fbclid, "IwcGRvZgNleHRuA2FlbQEwAGFkaWQBqzz59OhVk3NydGMGYXBwX2lk");

  assert.equal(attr.referrer, "https://l.facebook.com/");
  assert.equal(attr.landing_url, AD_URL);
  assert.equal(attr.landing_path, "/");
  assert.equal(attr.paid, true);
});

test("strips the funnel step hash from the landing URL", () => {
  // app/(customer)/page.tsx mirrors the step into the hash; it is not attribution.
  const attr = parseAttribution(AD_SEARCH, "", `${AD_URL}#style`);
  assert.equal(attr.landing_url, AD_URL);
  assert.ok(!attr.landing_url?.includes("#"));
});

test("a direct visit still records where they landed, but is not paid", () => {
  const attr = parseAttribution("", "", "https://aitryon.hairoriginals.com/");

  assert.equal(attr.paid, false);
  assert.equal(attr.utm_source, undefined);
  assert.equal(attr.referrer, undefined, "empty referrer must be omitted, not stored as ''");
  assert.equal(attr.landing_url, "https://aitryon.hairoriginals.com/");
  assert.ok(attr.landed_at);
});

test("blank param values are ignored rather than stored empty", () => {
  const attr = parseAttribution("?utm_source=&utm_medium=%20", "", "https://x.test/");
  assert.equal(attr.utm_source, undefined);
  assert.equal(attr.utm_medium, undefined);
  assert.equal(attr.paid, false, "empty params must not count as a campaign touch");
});

test("clamps a hostile param so the cookie can never blow the header limit", () => {
  const attr = parseAttribution(`?utm_source=${"x".repeat(5000)}`, "", "https://x.test/");
  assert.equal(attr.utm_source?.length, 500);
  assert.ok(serializeAttribution(attr));
});

test("first touch wins over a later, different campaign", () => {
  const first = parseAttribution(AD_SEARCH, "", AD_URL);
  const second = parseAttribution("?utm_source=google&utm_campaign=brand", "", "https://x.test/");

  assert.equal(shouldReplace(first, second), false);
});

test("a campaign click upgrades a bare direct first touch", () => {
  // Otherwise anyone who ever browsed organically is credited "direct" forever
  // and every later ad click is invisible to the CRM.
  const direct = parseAttribution("", "", "https://aitryon.hairoriginals.com/");
  const fromAd = parseAttribution(AD_SEARCH, "", AD_URL);

  assert.equal(direct.paid, false);
  assert.equal(shouldReplace(direct, fromAd), true);
  assert.equal(shouldReplace(fromAd, direct), false, "an ad touch is never downgraded");
});

test("with nothing stored, anything is written", () => {
  assert.equal(shouldReplace(null, parseAttribution("", "", "https://x.test/")), true);
});

test("survives a serialize → cookie → deserialize round trip", () => {
  const attr = parseAttribution(AD_SEARCH, "https://l.facebook.com/", AD_URL);
  const restored = deserializeAttribution(serializeAttribution(attr));

  assert.deepEqual(restored, attr);
});

test("a corrupt or absent cookie reads as no attribution, never throws", () => {
  assert.equal(deserializeAttribution(null), null);
  assert.equal(deserializeAttribution(""), null);
  assert.equal(deserializeAttribution("not-json"), null);
  assert.equal(deserializeAttribution("%E0%A4%A"), null, "malformed percent-encoding");
  assert.equal(deserializeAttribution(encodeURIComponent('"a string"')), null);
  assert.equal(deserializeAttribution(encodeURIComponent("[1,2]")), null, "arrays are not attribution");
});

test("browser write → server read: the seam the whole feature hangs on", () => {
  // The capture component writes this cookie in the browser; every API route
  // that creates a lead reads it back off the request. If these two disagree,
  // attribution is silently lost and leads look organic forever.
  const jar = installCookieJar();
  try {
    const landed = parseAttribution(AD_SEARCH, "https://l.facebook.com/", AD_URL);
    writeClientAttribution(landed);

    assert.deepEqual(readClientAttribution(), landed, "browser must read back its own write");

    // Server side: NextRequest exposes the same value via request.cookies.get().
    const raw = (globalThis as { document: { cookie: string } }).document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${ATTR_COOKIE}=`))!
      .slice(ATTR_COOKIE.length + 1);
    const request = { cookies: { get: (n: string) => (n === ATTR_COOKIE ? { value: raw } : undefined) } };

    const onServer = readAttributionCookie(request as never);
    assert.equal(onServer?.utm_campaign, "HO-HT-Female-Kolkata-WLP-static");
    assert.equal(onServer?.ad_id, "120256558077390339");
    assert.deepEqual(onServer, landed);
  } finally {
    jar.clear();
  }
});

test("a visitor with no cookie yields no attribution server-side", () => {
  const request = { cookies: { get: () => undefined } };
  assert.equal(readAttributionCookie(request as never), null);
});

test("sheds free text before giving up when a value is pathologically long", () => {
  const attr: Attribution = {
    landed_at: new Date().toISOString(),
    paid: true,
    utm_source: "meta",
    referrer: "https://r.test/".padEnd(3000, "x"),
    landing_url: "https://l.test/".padEnd(3000, "y"),
  };

  const restored = deserializeAttribution(serializeAttribution(attr));
  assert.ok(restored, "must still produce a usable cookie");
  assert.equal(restored.utm_source, "meta", "the campaign data is what must survive");
});
