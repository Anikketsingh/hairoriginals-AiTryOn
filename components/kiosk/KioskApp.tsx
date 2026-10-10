"use client";

/**
 * components/kiosk/KioskApp.tsx
 *
 * The in-store standee experience at /kiosk. Owns the device lifecycle
 * (registration, heartbeat, offline recovery) and the per-visitor state
 * machine; each screen is its own component in components/kiosk/.
 *
 *   attract (looping video) → camera (eye-level mirror) → style → generating
 *     → result → thanks → attract
 *
 * Shared-screen rules this file enforces:
 *   - Nothing about a visitor is written to localStorage/cookies. Their
 *     session token, photo and result live only in React state, and
 *     resetVisitor() drops all of it.
 *   - The device's identity is the httpOnly kiosk cookie (lib/kiosk-auth.ts),
 *     which page JS never sees.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useIdleReset } from "@/components/kiosk/useIdleReset";
import AttractScreen from "@/components/kiosk/AttractScreen";
import KioskCamera from "@/components/kiosk/KioskCamera";
import StyleScreen from "@/components/kiosk/StyleScreen";
import GeneratingScreen from "@/components/kiosk/GeneratingScreen";
import ResultScreen from "@/components/kiosk/ResultScreen";
import { PrimaryButton, SecondaryButton, StatusScreen } from "@/components/kiosk/ui";
import { compressForUpload, urlToUploadedImage } from "@/lib/image";
import type { Category, Product, UploadedImage } from "@/lib/types";

const HEARTBEAT_MS = 60_000;
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 60;
/** Reload the page after this many visitors to shed any memory creep. */
const RELOAD_AFTER_VISITORS = 30;
/** The thank-you screen returns to the attract loop by itself. */
const THANKS_SECONDS = 8;
const APP_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

interface KioskConfig {
  triesPerVisitor: number;
  dailyGenerationCap: number;
  idleTimeoutSeconds: number;
  downloadLinkTtlHours: number;
  attractVideoUrl: string | null;
}

type DeviceState =
  | { kind: "booting" }
  | { kind: "unregistered" }
  | { kind: "offline" }
  | { kind: "ready"; name: string; config: KioskConfig; capReached: boolean };

type Screen = "attract" | "camera" | "style" | "generating" | "result" | "thanks";

interface Visitor {
  sessionToken: string;
  triesLeft: number;
  photo?: UploadedImage;
  product?: Product;
  productImage?: UploadedImage;
  generationId?: string;
  resultUrl?: string;
}

export default function KioskApp() {
  const [device, setDevice] = useState<DeviceState>({ kind: "booting" });
  const [screen, setScreen] = useState<Screen>("attract");
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [preparingStyle, setPreparingStyle] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [staffOpen, setStaffOpen] = useState(false);
  const visitorsServed = useRef(0);
  // Bumped on every reset so an in-flight poll from the previous visitor
  // can never write into the next visitor's state.
  const visitorEpoch = useRef(0);

  // ── Device: heartbeat doubles as "who am I" ─────────────────
  const heartbeat = useCallback(async () => {
    try {
      const res = await fetch("/api/kiosk/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appVersion: APP_VERSION }),
      });
      if (res.status === 401) return setDevice({ kind: "unregistered" });
      if (!res.ok) return setDevice((d) => (d.kind === "ready" ? d : { kind: "offline" }));
      const data = await res.json();
      setDevice({ kind: "ready", name: data.kiosk.name, config: data.config, capReached: data.capReached });
    } catch {
      setDevice({ kind: "offline" });
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(heartbeat, 0);
    const t = setInterval(heartbeat, HEARTBEAT_MS);
    // Come back quickly once the network returns instead of waiting a minute.
    window.addEventListener("online", heartbeat);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("online", heartbeat);
    };
  }, [heartbeat]);

  // Offline: retry fast so the standee recovers by itself.
  useEffect(() => {
    if (device.kind !== "offline") return;
    const t = setInterval(heartbeat, 10_000);
    return () => clearInterval(t);
  }, [device.kind, heartbeat]);

  // Catalog — loaded once per page load; the nightly reboot refreshes it.
  useEffect(() => {
    if (device.kind !== "ready" || products.length > 0) return;
    Promise.all([
      fetch("/api/products").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/categories").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([p, c]: [Product[], Category[]]) => {
        setProducts(Array.isArray(p) ? p : []);
        setCategories(Array.isArray(c) ? c : []);
      })
      .catch(() => {});
  }, [device.kind, products.length]);

  // ── Lock down browser gestures the OS policies can't reach ─
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    const blockZoomKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0", "p", "s", "o"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    const blockCtrlWheel = (e: WheelEvent) => e.ctrlKey && e.preventDefault();
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("gesturestart", block);
    window.addEventListener("keydown", blockZoomKeys);
    window.addEventListener("wheel", blockCtrlWheel, { passive: false });
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("gesturestart", block);
      window.removeEventListener("keydown", blockZoomKeys);
      window.removeEventListener("wheel", blockCtrlWheel);
    };
  }, []);

  // ── Visitor lifecycle ──────────────────────────────────────
  const resetVisitor = useCallback(() => {
    visitorEpoch.current++;
    setVisitor(null);
    setError(null);
    setPreparingStyle(false);
    setScreen("attract");
    if (visitorsServed.current >= RELOAD_AFTER_VISITORS) window.location.reload();
  }, []);

  // Tapping the attract screen goes straight to the camera.
  const startVisitor = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/kiosk/session", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.status === 401) return setDevice({ kind: "unregistered" });
      if (data?.code === "kiosk_daily_cap") {
        setDevice((d) => (d.kind === "ready" ? { ...d, capReached: true } : d));
        return;
      }
      if (!res.ok || !data?.sessionToken) {
        setError(data?.error ?? "Something went wrong. Please tap again.");
        return;
      }
      visitorsServed.current++;
      setVisitor({ sessionToken: data.sessionToken, triesLeft: data.creditsGranted });
      setScreen("camera");
    } catch {
      setDevice({ kind: "offline" });
    } finally {
      setStarting(false);
    }
  }, [starting]);

  // Thank-you screen hands back to the attract loop on its own.
  useEffect(() => {
    if (screen !== "thanks") return;
    const t = setTimeout(resetVisitor, THANKS_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [screen, resetVisitor]);

  const idleEnabled = device.kind === "ready" && screen !== "attract" && screen !== "generating";
  const { secondsLeft, poke } = useIdleReset({
    timeoutSeconds: device.kind === "ready" ? device.config.idleTimeoutSeconds : 90,
    enabled: idleEnabled,
    onIdle: resetVisitor,
  });

  // ── Try-on round trip ──────────────────────────────────────
  const tryOn = useCallback(
    async (product: Product) => {
      if (!visitor?.photo?.file) return;
      const epoch = visitorEpoch.current;
      const token = visitor.sessionToken;
      setError(null);
      setPreparingStyle(true);

      try {
        const productImage = await urlToUploadedImage(product.image_url, `${product.slug}.jpg`, product.id);
        if (epoch !== visitorEpoch.current || !productImage.file) return;
        // The previous result stays until a new one lands, so running out of
        // tries can fall back to it instead of a blank screen.
        setVisitor((v) => v && { ...v, product, productImage });
        setPreparingStyle(false);
        setScreen("generating");

        const [personFile, productFile] = await Promise.all([
          compressForUpload(visitor.photo.file),
          compressForUpload(productImage.file),
        ]);
        const form = new FormData();
        form.append("personImage", personFile);
        form.append("productImage", productFile);
        form.append("sessionToken", token);
        form.append("productId", product.id);

        const res = await fetch("/api/generate", { method: "POST", body: form });
        const data = await res.json().catch(() => null);
        if (epoch !== visitorEpoch.current) return;

        if (data && "gate" in data) {
          // Out of tries for this visit.
          setVisitor((v) => v && { ...v, triesLeft: 0 });
          setScreen(visitor.resultUrl ? "result" : "thanks");
          return;
        }
        if (data?.code === "kiosk_daily_cap") {
          setDevice((d) => (d.kind === "ready" ? { ...d, capReached: true } : d));
          throw new Error("This kiosk has reached today's try-on limit.");
        }
        if (!res.ok || !data?.jobId) throw new Error(data?.error ?? "We couldn't create your look.");

        for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          if (epoch !== visitorEpoch.current) return;
          const s = await fetch(`/api/generate/status/${data.jobId}?sessionToken=${encodeURIComponent(token)}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          if (!s) continue;
          if (s.status === "completed" && s.resultUrl) {
            setVisitor(
              (v) =>
                v && {
                  ...v,
                  triesLeft: Math.max(0, v.triesLeft - 1),
                  generationId: data.jobId,
                  resultUrl: s.resultUrl,
                }
            );
            setScreen("result");
            return;
          }
          if (s.status === "failed") throw new Error("We couldn't create that look. Please try another style.");
        }
        throw new Error("This is taking too long. Please try again.");
      } catch (err) {
        if (epoch !== visitorEpoch.current) return;
        setPreparingStyle(false);
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setScreen("style");
      }
    },
    [visitor]
  );

  // ── Hidden staff menu: 5 quick taps in the top-left corner ─
  const cornerTaps = useRef<number[]>([]);
  const onCornerTap = () => {
    const now = Date.now();
    cornerTaps.current = [...cornerTaps.current.filter((t) => now - t < 3000), now];
    if (cornerTaps.current.length >= 5) {
      cornerTaps.current = [];
      setStaffOpen(true);
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 overflow-hidden bg-canvas text-ink">
      <button
        aria-hidden
        tabIndex={-1}
        onPointerDown={onCornerTap}
        className="absolute left-0 top-0 z-50 h-28 w-28 opacity-0"
      />

      {device.kind === "booting" && <StatusScreen title="Starting…" />}

      {device.kind === "unregistered" && (
        <StatusScreen
          title="This screen isn't registered yet"
          body="Staff: create this kiosk in Admin → Kiosks, then enter its enrollment code here."
        >
          <Link
            href="/kiosk/enroll"
            className="inline-flex min-h-[112px] items-center rounded-full bg-gradient-to-r from-grad-1 via-grad-2 to-grad-3 px-14 text-[34px] font-bold text-white shadow-[var(--shadow-brand)]"
          >
            Enter enrollment code
          </Link>
        </StatusScreen>
      )}

      {device.kind === "offline" && <StatusScreen title="We'll be right back" body="Reconnecting to the internet…" />}

      {device.kind === "ready" && (
        <>
          {screen === "attract" &&
            (device.capReached ? (
              <StatusScreen
                title="That's all for today"
                body="Thanks for visiting! Try on more styles anytime at hairoriginals.com."
              />
            ) : (
              <AttractScreen
                videoUrl={device.config.attractVideoUrl}
                starting={starting}
                error={error}
                onStart={startVisitor}
              />
            ))}

          {screen === "camera" && (
            <KioskCamera
              onCapture={(photo) => {
                setVisitor((v) => v && { ...v, photo });
                setScreen("style");
              }}
              onBack={resetVisitor}
            />
          )}

          {screen === "style" && visitor && (
            <StyleScreen
              products={products}
              categories={categories}
              photoUrl={visitor.photo?.dataUrl}
              loading={preparingStyle}
              error={error}
              triesLeft={visitor.triesLeft}
              onTryOn={tryOn}
              onRetake={() => setScreen("camera")}
            />
          )}

          {screen === "generating" && (
            <GeneratingScreen photoUrl={visitor?.photo?.dataUrl} styleUrl={visitor?.product?.image_url} />
          )}

          {screen === "result" && visitor?.resultUrl && (
            <ResultScreen
              resultUrl={visitor.resultUrl}
              photoUrl={visitor.photo?.dataUrl}
              styleName={visitor.product?.name}
              triesLeft={visitor.triesLeft}
              onTryAnother={() => {
                setError(null);
                setScreen("style");
              }}
              onFinish={() => setScreen("thanks")}
            />
          )}

          {screen === "thanks" && (
            <StatusScreen title="Thanks for trying!" body="Visit our experts in store to make your new look real.">
              <PrimaryButton onClick={resetVisitor}>Done</PrimaryButton>
            </StatusScreen>
          )}

          {secondsLeft !== null && (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-sm"
              onPointerDown={poke}
            >
              <div className="flex flex-col items-center gap-8 rounded-[56px] bg-surface px-20 py-16 shadow-[var(--shadow-pop)]">
                <h2 className="text-[56px] font-extrabold tracking-tight">Still there?</h2>
                <p className="text-[30px] text-ink-soft">Starting over in {secondsLeft}s</p>
                <PrimaryButton onClick={poke}>I&apos;m still here</PrimaryButton>
              </div>
            </div>
          )}
        </>
      )}

      {staffOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
          <div className="flex min-w-[560px] flex-col gap-6 rounded-[48px] bg-surface p-14 text-[28px]">
            <h2 className="text-[44px] font-extrabold">Staff</h2>
            <p>Kiosk: {device.kind === "ready" ? device.name : device.kind}</p>
            <p>Version: {APP_VERSION}</p>
            <PrimaryButton onClick={() => window.location.reload()}>Reload app</PrimaryButton>
            <SecondaryButton onClick={() => setStaffOpen(false)}>Close</SecondaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
