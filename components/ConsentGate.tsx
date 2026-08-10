"use client";

/**
 * components/ConsentGate.tsx
 *
 * Loads the Meta Pixel and Vercel Analytics only once tracking is permitted,
 * and shows the consent banner where prior opt-in is legally required.
 *
 * Previously both loaded unconditionally in app/layout.tsx, firing PageView for
 * every visitor before any consent existed. Because the scripts are now
 * rendered conditionally, a denial means `window.fbq` is never defined — and
 * trackPixelEvent() already no-ops in that case (lib/meta-pixel.ts), so every
 * downstream call site is covered without touching any of them.
 */

import { useCallback, useSyncExternalStore } from "react";
import Script from "next/script";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import {
  isConsentRequired,
  readStoredConsent,
  storeConsent,
  type ConsentValue,
} from "@/lib/consent";

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

type Decision = ConsentValue | "undecided" | "pending";

/**
 * The consent decision is external state (localStorage + the visitor's region),
 * so it's read through useSyncExternalStore rather than an effect. That renders
 * the correct value on the first client paint instead of flashing a default,
 * and avoids a setState-in-effect cascade.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab may record a decision; keep this one in step.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Cached so the Intl lookup doesn't rerun on every render. */
let consentRequired: boolean | null = null;

function getSnapshot(): Decision {
  const stored = readStoredConsent();
  if (stored) return stored;
  consentRequired ??= isConsentRequired();
  // No stored choice: ask where required, otherwise proceed under the
  // opt-out model documented in the privacy policy.
  return consentRequired ? "undecided" : "granted";
}

/** Nothing tracking-related may load during SSR — the choice isn't known yet. */
function getServerSnapshot(): Decision {
  return "pending";
}

export default function ConsentGate() {
  const decision = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const decide = useCallback((value: ConsentValue) => {
    storeConsent(value);
    listeners.forEach((listener) => listener());
  }, []);

  return (
    <>
      {decision === "granted" && (
        <>
          <Analytics />
          {META_PIXEL_ID && (
            <>
              <Script id="meta-pixel" strategy="afterInteractive">
                {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
              </Script>
              <noscript>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  height="1"
                  width="1"
                  style={{ display: "none" }}
                  src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
                  alt=""
                />
              </noscript>
            </>
          )}
        </>
      )}

      {decision === "undecided" && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-[100] border-t border-line bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur"
        >
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            <p className="text-xs leading-relaxed text-ink-soft">
              We use cookies to measure how the try-on is used and to improve our ads.
              You can decline and the app will work exactly the same.{" "}
              <Link href="/privacy" className="font-semibold text-ink underline underline-offset-2">
                Privacy Policy
              </Link>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => decide("denied")}
                className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunken"
              >
                Decline
              </button>
              <button
                onClick={() => decide("granted")}
                className="min-h-11 flex-1 rounded-[var(--radius-md)] bg-brand px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
