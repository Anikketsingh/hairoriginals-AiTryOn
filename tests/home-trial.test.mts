/**
 * tests/home-trial.test.mts
 *
 * Audience resolution and outbound link tagging for the result-screen home
 * trial offer.
 *
 * Worth pinning because both failure modes are silent. A wrong audience check
 * shows a women's extensions creative to someone browsing men's patches — it
 * renders perfectly, it's just the wrong ad. A wrong URL builder overwrites a
 * hand-tagged campaign link or drops the ad click ids, and the bookings still
 * land, just attributed to nothing.
 *
 * lib/home-trial.ts imports only types, so it runs under plain Node.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOfferUrl,
  inAudience,
  popupBlockReason,
  resolveOffer,
  shouldShowPopup,
} from "../lib/home-trial.ts";
import type { PopupHistory } from "../lib/home-trial.ts";
import type { Attribution, HomeTrialConfig } from "../lib/types.ts";

const BASE = "https://www.hairoriginals.com/pages/try-at-home-new";

function config(overrides: Partial<HomeTrialConfig> = {}): HomeTrialConfig {
  return {
    enabled: true,
    popupEnabled: true,
    url: BASE,
    imageWomen: "/women.jpg",
    imageMen: "/men.jpg",
    ctaLabel: "Book a home trial",
    subtext: "A stylist brings the hair to you.",
    badge: "At home",
    audience: "all",
    minTryons: 1,
    delayMs: 4500,
    oncePerSession: false,
    stopAfterBooking: true,
    ...overrides,
  };
}

function attribution(overrides: Partial<Attribution> = {}): Attribution {
  return { landed_at: "2026-08-20T00:00:00.000Z", paid: false, ...overrides };
}

// ── audience ────────────────────────────────────────────────────────────────

test("'all' reaches both catalogues", () => {
  assert.equal(inAudience("all", "women"), true);
  assert.equal(inAudience("all", "men"), true);
});

test("a single-gender audience excludes the other", () => {
  assert.equal(inAudience("women", "women"), true);
  assert.equal(inAudience("women", "men"), false);
  assert.equal(inAudience("men", "men"), true);
  assert.equal(inAudience("men", "women"), false);
});

// ── resolveOffer ────────────────────────────────────────────────────────────

test("each gender gets its own creative", () => {
  assert.equal(resolveOffer(config(), "women")?.imageUrl, "/women.jpg");
  assert.equal(resolveOffer(config(), "men")?.imageUrl, "/men.jpg");
});

test("the master switch hides the offer from everyone", () => {
  assert.equal(resolveOffer(config({ enabled: false }), "women"), null);
  assert.equal(resolveOffer(config({ enabled: false }), "men"), null);
});

test("an out-of-audience customer gets nothing at all", () => {
  assert.equal(resolveOffer(config({ audience: "women" }), "men"), null);
  assert.notEqual(resolveOffer(config({ audience: "women" }), "women"), null);
});

test("config that never loaded resolves to no offer rather than throwing", () => {
  assert.equal(resolveOffer(null, "women"), null);
});

test("popupEnabled does not affect the inline offer", () => {
  // The popup switch gates timing in the hook; the card must survive it.
  assert.notEqual(resolveOffer(config({ popupEnabled: false }), "women"), null);
});

// ── shouldShowPopup — the "don't be annoying" contract ──────────────────────

/** A customer who just finished a try-on with a clean slate: the eligible baseline. */
function history(overrides: Partial<PopupHistory> = {}): PopupHistory {
  return {
    gender: "women",
    tryOnCount: 1,
    shownThisSession: false,
    converted: false,
    ...overrides,
  };
}

test("by default the popup fires after every result, first one included", () => {
  assert.equal(shouldShowPopup(config(), history({ tryOnCount: 1 })), true);
  assert.equal(shouldShowPopup(config(), history({ tryOnCount: 2 })), true);
  // Repeatedly, because oncePerSession is off by default.
  assert.equal(shouldShowPopup(config(), history({ tryOnCount: 7 })), true);
});

test("minTryons can hold the popup back from the first N results", () => {
  assert.equal(shouldShowPopup(config({ minTryons: 2 }), history({ tryOnCount: 1 })), false);
  assert.equal(shouldShowPopup(config({ minTryons: 2 }), history({ tryOnCount: 2 })), true);
  assert.equal(shouldShowPopup(config({ minTryons: 3 }), history({ tryOnCount: 2 })), false);
  assert.equal(shouldShowPopup(config({ minTryons: 3 }), history({ tryOnCount: 3 })), true);
});

test("oncePerSession is what silences repeats, and only when switched on", () => {
  const seen = history({ tryOnCount: 5, shownThisSession: true });
  assert.equal(shouldShowPopup(config({ oncePerSession: true }), seen), false);
  assert.equal(shouldShowPopup(config({ oncePerSession: false }), seen), true);
});

test("with oncePerSession on, a fresh session re-opens the door", () => {
  const cfg = config({ oncePerSession: true });
  assert.equal(shouldShowPopup(cfg, history({ tryOnCount: 9, shownThisSession: false })), true);
  assert.equal(shouldShowPopup(cfg, history({ tryOnCount: 9, shownThisSession: true })), false);
});

test("stopAfterBooking spares someone who already tapped through", () => {
  const booked = history({ converted: true });
  assert.equal(shouldShowPopup(config({ stopAfterBooking: true }), booked), false);
  assert.equal(shouldShowPopup(config({ stopAfterBooking: false }), booked), true);
});

test("both kill switches stop the popup", () => {
  assert.equal(shouldShowPopup(config({ enabled: false }), history()), false);
  assert.equal(shouldShowPopup(config({ popupEnabled: false }), history()), false);
});

test("the popup obeys the same audience rule as the card", () => {
  assert.equal(shouldShowPopup(config({ audience: "women" }), history({ gender: "men" })), false);
  assert.equal(shouldShowPopup(config({ audience: "men" }), history({ gender: "men" })), true);
  assert.equal(shouldShowPopup(config({ audience: "all" }), history({ gender: "men" })), true);
});

test("config that never loaded never pops", () => {
  assert.equal(shouldShowPopup(null, history()), false);
});

test("every block reason names itself, for the console diagnostic", () => {
  const cases: [ReturnType<typeof config> | null, Partial<PopupHistory>, string][] = [
    [null, {}, "no_config"],
    [config({ enabled: false }), {}, "offer_disabled"],
    [config({ popupEnabled: false }), {}, "popup_disabled"],
    [config({ audience: "women" }), { gender: "men" }, "out_of_audience"],
    [config({ minTryons: 3 }), { tryOnCount: 1 }, "min_tryons"],
    [config({ oncePerSession: true }), { shownThisSession: true }, "once_per_session"],
    [config({ stopAfterBooking: true }), { converted: true }, "already_booked"],
  ];
  for (const [cfg, hist, code] of cases) {
    const block = popupBlockReason(cfg, history(hist));
    assert.equal(block?.code, code);
    assert.ok(block!.message.length > 0, `${code} needs a message`);
  }
});

test("only the frequency caps are waivable by the QA override", () => {
  // A kill switch or the wrong audience must never be overridable — otherwise
  // ?hometrial=force would show a disabled offer to a real customer.
  assert.equal(popupBlockReason(config({ enabled: false }), history())?.waivable, false);
  assert.equal(popupBlockReason(config({ popupEnabled: false }), history())?.waivable, false);
  assert.equal(
    popupBlockReason(config({ audience: "men" }), history({ gender: "women" }))?.waivable,
    false
  );

  assert.equal(popupBlockReason(config({ minTryons: 5 }), history())?.waivable, true);
  assert.equal(
    popupBlockReason(config({ oncePerSession: true }), history({ shownThisSession: true }))?.waivable,
    true
  );
  assert.equal(popupBlockReason(config(), history({ converted: true }))?.waivable, true);
});

test("an eligible customer has no block reason at all", () => {
  assert.equal(popupBlockReason(config(), history()), null);
  assert.equal(shouldShowPopup(config(), history()), true);
});

test("the badge is carried through to the card, and may be blank", () => {
  assert.equal(resolveOffer(config(), "women")?.badge, "At home");
  // Blank is a real choice — it hides the pill rather than falling back.
  assert.equal(resolveOffer(config({ badge: "" }), "women")?.badge, "");
});

test("no customer-facing copy calls the home trial free", () => {
  // It is a paid service. This is the one claim that must never regress, and
  // the strings live in the DB where a typo has no compiler to catch it.
  const offer = resolveOffer(config(), "women")!;
  for (const text of [offer.ctaLabel, offer.subtext, offer.badge]) {
    assert.ok(!/\bfree\b/i.test(text), `"${text}" must not say free`);
  }
});

// ── buildOfferUrl ───────────────────────────────────────────────────────────

test("tags an untagged booking URL with the source of the tap", () => {
  const url = new URL(buildOfferUrl(BASE, "result_popup", null));
  assert.equal(url.origin + url.pathname, BASE);
  assert.equal(url.searchParams.get("utm_source"), "ai_tryon");
  assert.equal(url.searchParams.get("utm_medium"), "result_popup");
  assert.equal(url.searchParams.get("utm_campaign"), "home_trial");
});

test("the two surfaces are distinguishable in the storefront's analytics", () => {
  const popup = new URL(buildOfferUrl(BASE, "result_popup", null));
  const card = new URL(buildOfferUrl(BASE, "result_card", null));
  assert.notEqual(popup.searchParams.get("utm_medium"), card.searchParams.get("utm_medium"));
});

test("params already on the admin's URL are never overwritten", () => {
  const tagged = `${BASE}?utm_source=newsletter&utm_campaign=diwali`;
  const url = new URL(buildOfferUrl(tagged, "result_popup", null));
  assert.equal(url.searchParams.get("utm_source"), "newsletter");
  assert.equal(url.searchParams.get("utm_campaign"), "diwali");
  // Only the gap gets filled.
  assert.equal(url.searchParams.get("utm_medium"), "result_popup");
});

test("forwards the ad click ids captured on landing", () => {
  const url = new URL(
    buildOfferUrl(BASE, "result_card", attribution({ fbclid: "fb.1.abc", gclid: "gcl.xyz" }))
  );
  assert.equal(url.searchParams.get("fbclid"), "fb.1.abc");
  assert.equal(url.searchParams.get("gclid"), "gcl.xyz");
});

test("omits click ids the visitor never had", () => {
  const url = new URL(buildOfferUrl(BASE, "result_card", attribution({ fbclid: "fb.1.abc" })));
  assert.equal(url.searchParams.get("fbclid"), "fb.1.abc");
  assert.equal(url.searchParams.has("gclid"), false);
});

test("an existing query string survives tagging", () => {
  const url = new URL(buildOfferUrl(`${BASE}?variant=b`, "result_popup", null));
  assert.equal(url.searchParams.get("variant"), "b");
  assert.equal(url.searchParams.get("utm_source"), "ai_tryon");
});

test("a malformed admin URL is handed over untouched rather than swallowed", () => {
  // Better an untagged visit than a tap that goes nowhere.
  assert.equal(buildOfferUrl("not a url", "result_popup", null), "not a url");
  assert.equal(buildOfferUrl("", "result_popup", null), "");
});
