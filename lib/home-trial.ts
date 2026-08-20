/**
 * lib/home-trial.ts
 *
 * The pure decisions behind the result-screen home trial offer: who is in its
 * audience, which creative they get, and how the outbound link is tagged.
 *
 * Split out of hooks/useHomeTrial.ts — which owns the React state, the
 * localStorage caps and the popup timer — so these can be reasoned about and
 * tested without a DOM. No imports beyond types, same as lib/attribution.ts.
 */

import type {
  Attribution,
  HomeTrialAudience,
  HomeTrialConfig,
  HomeTrialOffer,
  HomeTrialSource,
} from "@/lib/types";

/** An offer set to one gender is hidden from the other; "all" shows to both. */
export function inAudience(audience: HomeTrialAudience, gender: HomeTrialAudience): boolean {
  return audience === "all" || audience === gender;
}

/**
 * The offer as this customer should see it, or null when they aren't in its
 * audience or it's switched off. Null is the single signal the UI checks.
 */
export function resolveOffer(
  config: HomeTrialConfig | null,
  gender: HomeTrialAudience
): HomeTrialOffer | null {
  if (!config || !config.enabled) return null;
  if (!inAudience(config.audience, gender)) return null;

  return {
    url: config.url,
    imageUrl: gender === "men" ? config.imageMen : config.imageWomen,
    ctaLabel: config.ctaLabel,
    subtext: config.subtext,
    badge: config.badge,
  };
}

/** Everything the popup decision depends on, read from the browser by the hook. */
export interface PopupHistory {
  gender: HomeTrialAudience;
  /** Try-ons completed on this device, including the one that just finished. */
  tryOnCount: number;
  /** The popup has already been shown in this browser session. */
  shownThisSession: boolean;
  /** She has tapped through to the booking page at some point on this device. */
  converted: boolean;
}

/** Why the popup stayed shut. `waivable` marks the frequency caps a QA override may skip. */
export interface PopupBlock {
  code:
    | "no_config"
    | "offer_disabled"
    | "popup_disabled"
    | "out_of_audience"
    | "min_tryons"
    | "once_per_session"
    | "already_booked";
  message: string;
  waivable: boolean;
}

/**
 * The single reason a completed try-on did not raise the popup, or null when it
 * should open.
 *
 * Phrased as a reason rather than a boolean because "the popup isn't showing"
 * is otherwise undebuggable from the outside — seven conditions collapse into
 * one silent false, and three of them are sticky browser state you cannot see.
 * The hook logs this straight to the console.
 *
 * The frequency rules are all admin-tunable, because how hard to push an offer
 * is a marketing call that shouldn't need a deploy to revisit:
 *   - `minTryons` — how many try-ons before it may fire at all (1 = every result)
 *   - `oncePerSession` — cap it at one impression per browser session
 *   - `stopAfterBooking` — never ask again once she has clicked through
 */
export function popupBlockReason(
  config: HomeTrialConfig | null,
  history: PopupHistory
): PopupBlock | null {
  if (!config) {
    return { code: "no_config", message: "GET /api/home-trial hasn't answered yet.", waivable: false };
  }
  if (!config.enabled) {
    return {
      code: "offer_disabled",
      message: "home_trial_enabled is off in Admin → AI Configuration.",
      waivable: false,
    };
  }
  if (!config.popupEnabled) {
    return {
      code: "popup_disabled",
      message: "home_trial_popup_enabled is off in Admin → AI Configuration.",
      waivable: false,
    };
  }
  if (!inAudience(config.audience, history.gender)) {
    return {
      code: "out_of_audience",
      message: `Audience is "${config.audience}" but this customer is browsing "${history.gender}".`,
      waivable: false,
    };
  }
  if (history.tryOnCount < config.minTryons) {
    return {
      code: "min_tryons",
      message: `Try-on ${history.tryOnCount} of ${config.minTryons} required. Clear localStorage "ho_tryon_count" or lower "Show From Try-On #".`,
      waivable: true,
    };
  }
  if (config.oncePerSession && history.shownThisSession) {
    return {
      code: "once_per_session",
      message: 'Already shown this browser session. Clear sessionStorage "ho_home_trial_shown" or turn off "Only Once Per Browser Session".',
      waivable: true,
    };
  }
  if (config.stopAfterBooking && history.converted) {
    return {
      code: "already_booked",
      message: 'This device already tapped through to the booking page. Clear localStorage "ho_home_trial_converted" or turn off "Stop After She Books".',
      waivable: true,
    };
  }
  return null;
}

/** Whether a completed try-on should raise the popup. See popupBlockReason. */
export function shouldShowPopup(config: HomeTrialConfig | null, history: PopupHistory): boolean {
  return popupBlockReason(config, history) === null;
}

/**
 * Tags the booking link so the storefront can attribute the visit, and forwards
 * the ad click ids captured on landing (lib/attribution.ts) so the trail back to
 * the original campaign survives the hop off our domain.
 *
 * Params already present in the admin-set URL always win: a hand-tagged URL is
 * a deliberate choice by whoever typed it, and silently overwriting it would
 * misattribute the campaign it was tagged for.
 */
export function buildOfferUrl(
  base: string,
  source: HomeTrialSource,
  attribution: Attribution | null
): string {
  try {
    const url = new URL(base);
    const setIfAbsent = (key: string, value: string | undefined) => {
      if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
    };

    setIfAbsent("utm_source", "ai_tryon");
    setIfAbsent("utm_medium", source);
    setIfAbsent("utm_campaign", "home_trial");
    setIfAbsent("fbclid", attribution?.fbclid);
    setIfAbsent("gclid", attribution?.gclid);

    return url.toString();
  } catch {
    // A malformed URL typed into the admin panel still opens as-is: dropping
    // the customer's tap entirely is worse than an untagged visit.
    return base;
  }
}
