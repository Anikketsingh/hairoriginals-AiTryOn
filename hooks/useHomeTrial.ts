"use client";

/**
 * hooks/useHomeTrial.ts
 *
 * The result-screen "book a home trial" offer: a route from an AI try-on
 * straight to the storefront's booking page, where a stylist visits with the
 * real product.
 *
 * Two surfaces, deliberately different in weight:
 *   - An inline card on the result screen, always there while the customer is
 *     in the offer's audience. No timer, no cap — `offer` non-null means show it.
 *   - A popup that fires at most once per browser session, and only from the
 *     customer's Nth try-on onward (admin-set, default the 2nd). The first
 *     result always stays clean.
 *
 * Why the popup is capped the way it is:
 *   - `ho_tryon_count` (localStorage, lifetime) — never interrupts a first
 *     impression, and a returning customer who already qualified stays qualified.
 *   - `ho_home_trial_shown` (sessionStorage) — one impression per browser
 *     session, so closing the tab is what earns another, not reloading.
 *   - `ho_home_trial_converted` (localStorage) — once she has clicked through
 *     to the booking page, the popup never auto-opens on this device again.
 *     The inline card stays, so the path is never actually taken away.
 *
 * Storage is wrapped throughout: Safari private mode throws on write, and a
 * marketing prompt must never be what breaks the result screen.
 *
 * Config comes from GET /api/home-trial (admin-editable, see lib/settings.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { readClientAttribution } from "@/lib/attribution";
import { trackAnalyticsEvent } from "@/lib/analytics-client";
import { buildOfferUrl, popupBlockReason, resolveOffer } from "@/lib/home-trial";
import type {
  HomeTrialAudience,
  HomeTrialConfig,
  HomeTrialOffer,
  HomeTrialSource,
} from "@/lib/types";

/**
 * QA override. `?hometrial=force` on the customer URL waives the three
 * frequency caps — the try-on count, the per-session cap, and the
 * already-booked flag — so the popup can be seen on demand without clearing
 * browser storage by hand.
 *
 * Deliberately not dev-only: the caps are sticky per-device state, so this is
 * exactly as necessary on a deployed preview as it is locally. It cannot
 * override the kill switches or the audience rule, so the worst it can do is
 * show you your own popup.
 */
const FORCE_PARAM = "hometrial";
const FORCE_VALUE = "force";

const GENDER_KEY = "ho_selected_gender";
const TRYON_COUNT_KEY = "ho_tryon_count";
const SHOWN_KEY = "ho_home_trial_shown";
const CONVERTED_KEY = "ho_home_trial_converted";

/** Every storage read is best-effort — a blocked jar reads as "no history". */
function readStore(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function writeStore(store: "local" | "session", key: string, value: string): void {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    /* Storage unavailable — the cap degrades to "may show again", not a crash. */
  }
}

/** Catalogue gender, defaulting to women to match /api/suggest's own fallback. */
function readGender(): HomeTrialAudience {
  return readStore("local", GENDER_KEY) === "men" ? "men" : "women";
}

export interface UseHomeTrial {
  /** Non-null when the inline result-screen card should render. */
  offer: HomeTrialOffer | null;
  popupOpen: boolean;
  /**
   * Call once per completed try-on. Counts it, then decides whether the popup
   * is going to open and schedules it. Resolves true when it will, so the
   * caller can hold back anything else that wants the screen.
   */
  armPopup: () => Promise<boolean>;
  /**
   * The result screen no longer owns the popup: drops a pending timer and
   * closes it if it already opened. Not a dismissal — no event is recorded.
   */
  cancelPopup: () => void;
  /** Dismissed without converting. */
  dismissPopup: () => void;
  /** Tap-through, from either surface. Opens the booking page in a new tab. */
  openOffer: (source: HomeTrialSource, productId?: string) => void;
}

/**
 * @param active     Start loading the config. False on the landing screen, so a
 *                   bounce costs no request.
 * @param sessionToken Attaches the analytics events to the funnel session.
 */
export function useHomeTrial(active: boolean, sessionToken: string | null): UseHomeTrial {
  const [config, setConfig] = useState<HomeTrialConfig | null>(null);
  const [gender, setGender] = useState<HomeTrialAudience>("women");
  const [popupOpen, setPopupOpen] = useState(false);

  const timerRef = useRef<number | null>(null);
  const forceRef = useRef(false);
  // The fetch is shared between the effect below and armPopup, which may run
  // before it has landed and needs to wait for it rather than miss the popup.
  const configRequestRef = useRef<Promise<HomeTrialConfig | null> | null>(null);
  // armPopup reads these at call time, after the awaited fetch — state captured
  // in the closure would be a render stale by then.
  const genderRef = useRef<HomeTrialAudience>("women");

  const loadConfig = useCallback((): Promise<HomeTrialConfig | null> => {
    if (!configRequestRef.current) {
      configRequestRef.current = fetch("/api/home-trial")
        .then((res) => (res.ok ? (res.json() as Promise<HomeTrialConfig>) : null))
        .catch(() => null);
    }
    return configRequestRef.current;
  }, []);

  useEffect(() => {
    try {
      forceRef.current =
        new URLSearchParams(window.location.search).get(FORCE_PARAM) === FORCE_VALUE;
    } catch {
      /* Malformed query string — no override, which is the safe default. */
    }
  }, []);

  // Catalogue gender, kept in sync with the Women/Men toggle on the style step
  // (components/flow/StyleStep.tsx dispatches this event on every change).
  useEffect(() => {
    const sync = () => {
      const g = readGender();
      genderRef.current = g;
      setGender(g);
    };
    sync();
    window.addEventListener("ho_gender_changed", sync);
    return () => window.removeEventListener("ho_gender_changed", sync);
  }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    loadConfig().then((c) => {
      if (alive) setConfig(c);
    });
    return () => {
      alive = false;
    };
  }, [active, loadConfig]);

  // Nothing scheduled may outlive the page.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const cancelPopup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Also closes an already-open sheet. The Android back button fires popstate
    // straight past the backdrop, so a step change can happen underneath it —
    // leaving the offer floating over the style grid.
    setPopupOpen(false);
  }, []);

  const armPopup = useCallback(async (): Promise<boolean> => {
    // Counted before any eligibility check, so a customer who is out of the
    // audience today still qualifies if the audience is widened tomorrow.
    const count = Number(readStore("local", TRYON_COUNT_KEY) ?? "0") + 1;
    writeStore("local", TRYON_COUNT_KEY, String(count));

    const cfg = await loadConfig();
    const blocked = popupBlockReason(cfg, {
      gender: genderRef.current,
      tryOnCount: count,
      shownThisSession: readStore("session", SHOWN_KEY) === "1",
      converted: readStore("local", CONVERTED_KEY) === "1",
    });

    if (blocked && !(forceRef.current && blocked.waivable)) {
      // Says out loud why nothing happened. Three of these reasons are sticky
      // browser state with no visible symptom, which otherwise reads as a bug.
      if (process.env.NODE_ENV !== "production" || forceRef.current) {
        console.info(
          `[home-trial] popup not shown — ${blocked.code}: ${blocked.message}` +
            (blocked.waivable ? "\n[home-trial] Add ?hometrial=force to the URL to bypass this." : "")
        );
      }
      return false;
    }
    if (!cfg) return false;

    cancelPopup();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      // Claimed here rather than at arm time: a popup that got cancelled
      // because she left the result screen never cost her the impression.
      writeStore("session", SHOWN_KEY, "1");
      setPopupOpen(true);
      void trackAnalyticsEvent(
        "home_trial_shown",
        { source: "result_popup", tryOnCount: count, gender: genderRef.current },
        sessionToken
      );
    }, cfg.delayMs);

    return true;
  }, [loadConfig, cancelPopup, sessionToken]);

  const dismissPopup = useCallback(() => {
    setPopupOpen(false);
    void trackAnalyticsEvent(
      "home_trial_dismissed",
      { source: "result_popup", gender: genderRef.current },
      sessionToken
    );
  }, [sessionToken]);

  const openOffer = useCallback(
    (source: HomeTrialSource, productId?: string) => {
      if (!config) return;

      writeStore("local", CONVERTED_KEY, "1");
      setPopupOpen(false);
      void trackAnalyticsEvent(
        "home_trial_clicked",
        { source, productId, gender: genderRef.current },
        sessionToken
      );

      // Synchronous, and never awaited behind the beacon above — a popup
      // blocker kills window.open the moment it leaves the click's call stack.
      window.open(
        buildOfferUrl(config.url, source, readClientAttribution()),
        "_blank",
        "noopener,noreferrer"
      );
    },
    [config, sessionToken]
  );

  const offer: HomeTrialOffer | null = resolveOffer(config, gender);

  return { offer, popupOpen, armPopup, cancelPopup, dismissPopup, openOffer };
}
