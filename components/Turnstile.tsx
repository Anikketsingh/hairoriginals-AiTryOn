"use client";

/**
 * components/Turnstile.tsx
 *
 * Cloudflare Turnstile widget for the phone gate.
 *
 * Why this exists: signInWithOtp() runs browser → Supabase directly and never
 * touches a Next.js route, so there is no server of ours in the path to
 * rate-limit it. Without a captcha it is an unauthenticated, unmetered trigger
 * for a paid SMS gateway — the standard setup for SMS pumping fraud, where
 * attackers drive OTPs to premium-rate ranges and take a carrier revenue share.
 *
 * Turnstile is free and usually invisible to real users. The token is passed to
 * signInWithOtp({ options: { captchaToken } }) and verified by Supabase, which
 * must have captcha enabled (Dashboard → Auth → Bot and Abuse Protection) for
 * the token to actually be checked.
 *
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, so local dev
 * and unconfigured environments still work.
 */

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileHandle {
  /** Clears the current token and re-challenges. Tokens are single-use. */
  reset: () => void;
}

/** True when a site key is configured, i.e. the widget will actually render. */
export const isTurnstileEnabled = Boolean(SITE_KEY);

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Turnstile"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function Turnstile({
  onToken,
  ref,
}: {
  /** Fires with a fresh token, or null when the token expires or errors. */
  onToken: (token: string | null) => void;
  ref?: Ref<TurnstileHandle>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Keep the latest callback without re-rendering the widget: re-rendering
  // would issue a new challenge on every parent state change (i.e. every
  // keystroke in the phone field). Synced in an effect rather than during
  // render — mutating a ref mid-render is unsafe under concurrent rendering.
  // This effect is declared before the mount effect below so the callback is
  // always current by the time the widget can invoke it.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          onTokenRef.current(null);
        }
      },
    }),
    [],
  );

  const mount = useCallback(async () => {
    if (!SITE_KEY || !containerRef.current || widgetIdRef.current) return;
    try {
      await loadTurnstileScript();
    } catch {
      // Script blocked (ad blocker, offline). Signal "no token" so the gate can
      // decide — it stays usable rather than trapping the user behind a widget
      // that will never load.
      onTokenRef.current(null);
      return;
    }
    if (!window.turnstile || !containerRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(null),
      "error-callback": () => onTokenRef.current(null),
      // Stay invisible unless the visitor actually looks suspicious, so the
      // common case adds no friction to signup.
      appearance: "interaction-only",
    });
  }, []);

  useEffect(() => {
    void mount();
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [mount]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className="flex justify-center empty:hidden" />;
}
