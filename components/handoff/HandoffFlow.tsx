"use client";

/**
 * components/handoff/HandoffFlow.tsx
 *
 * The standee visitor's phone page (/s/[token]):
 *   1. "Your looks are ready" — looks shown blurred, name + number to unlock.
 *   2. Options — SMS my photos · home trial with the standee-only discount ·
 *      WhatsApp · call · explore the store.
 * Every tap is recorded against their Standee Lead for the sales team
 * (POST /api/handoff/[token]/action).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Home,
  Lock,
  MessageCircle,
  Phone,
  Send,
  ShoppingBag,
  Sparkles,
  Tag,
  User,
  X,
} from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { cn } from "@/components/ui/cn";
import { DEFAULT_COUNTRY, SUPPORTED_COUNTRIES, countryByIso, isValidMobile } from "@/lib/phone";

interface Look {
  id: string;
  url: string;
  styleName: string | null;
}

interface Offer {
  discountPercent: number;
  title: string;
  text: string;
  couponCode: string;
  whatsappNumber: string;
  contactPhone: string;
  homeTrialUrl: string;
}

interface HandoffState {
  claimed: boolean;
  kioskName: string | null;
  looks: Look[];
  offer: Offer;
  contactName: string | null;
  maskedPhone: string | null;
  downloadUrl: string | null;
  smsRemaining: number;
}

type Action = "send_photos" | "home_trial" | "whatsapp" | "call" | "store";

const STORE_URL = (process.env.NEXT_PUBLIC_STORE_URL || "https://hairoriginals.com").replace(/\/$/, "");

function withUtm(url: string, content: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "ai_tryon");
    u.searchParams.set("utm_medium", "kiosk");
    u.searchParams.set("utm_campaign", "standee");
    u.searchParams.set("utm_content", content);
    return u.toString();
  } catch {
    return url;
  }
}

export default function HandoffFlow({ token }: { token: string }) {
  const [state, setState] = useState<HandoffState | null>(null);
  const [fatal, setFatal] = useState<"expired" | "not_found" | "error" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/handoff/${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFatal(data?.code === "expired" ? "expired" : res.status === 404 ? "not_found" : "error");
        return;
      }
      setState(data as HandoffState);
    } catch {
      setFatal("error");
    }
  }, [token]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const track = useCallback(
    (action: Action) =>
      fetch(`/api/handoff/${encodeURIComponent(token)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        // Survives the page navigating away to WhatsApp / the dialer / the store.
        keepalive: true,
      }),
    [token]
  );

  if (fatal) return <DeadEnd reason={fatal} />;
  if (!state) return <Loading />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pb-safe pt-safe">
      <header className="flex flex-col items-center gap-3 pt-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-wordmark.png" alt="HairOriginals" className="h-7 w-auto" />
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          {state.claimed
            ? `${state.contactName ? `${state.contactName.split(" ")[0]}, your` : "Your"} looks are unlocked ✨`
            : "Your looks are ready ✨"}
        </h1>
        {state.kioskName && !state.claimed && (
          <p className="text-sm text-ink-soft">Created at the {state.kioskName} try-on mirror</p>
        )}
      </header>

      <LooksGallery looks={state.looks} locked={!state.claimed} />

      {state.claimed ? (
        <Options token={token} state={state} track={track} onRefresh={load} />
      ) : (
        <ClaimForm token={token} lookCount={state.looks.length} discount={state.offer.discountPercent} onClaimed={load} />
      )}

      <p className="pb-6 text-center text-[11px] leading-relaxed text-ink-faint">
        Your photos are private to you. HairOriginals uses your number only to send your looks and follow up on your
        enquiry.
      </p>
    </main>
  );
}

// ── Looks ─────────────────────────────────────────────────────

function LooksGallery({ looks, locked }: { looks: Look[]; locked: boolean }) {
  if (looks.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-8 text-center text-sm text-ink-soft">
        Your looks are still being created — they&apos;ll appear here in a moment.
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5">
        {looks.map((look) => (
          <div
            key={look.id}
            className={cn(
              "relative shrink-0 snap-center overflow-hidden rounded-[var(--radius-xl)] bg-surface-sunken shadow-[var(--shadow-pop)]",
              looks.length === 1 ? "w-full" : "w-[78%]"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img
              src={look.url}
              alt={look.styleName ?? "Your look"}
              className={cn("aspect-[3/4] w-full object-cover transition-[filter] duration-700", locked && "blur-xl scale-110")}
            />
            {!locked && look.styleName && (
              <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                {look.styleName}
              </span>
            )}
          </div>
        ))}
      </div>
      {locked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-sm font-bold text-white backdrop-blur-md">
            <Lock className="h-4 w-4" /> {looks.length} {looks.length === 1 ? "look" : "looks"} waiting for you
          </span>
        </div>
      )}
    </div>
  );
}

// ── Step 1: number ───────────────────────────────────────────

function ClaimForm({
  token,
  lookCount,
  discount,
  onClaimed,
}: {
  token: string;
  lookCount: number;
  discount: number;
  onClaimed: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isValidMobile(phone, country);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/handoff/${encodeURIComponent(token)}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, country, name: name.trim() || undefined, consent: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      onClaimed();
    } catch {
      setError("Couldn't connect. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
      <div>
        <h2 className="text-lg font-bold text-ink">Unlock {lookCount > 1 ? "your looks" : "your look"}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Enter your number to download your photos{discount > 0 ? <> and get <b className="text-brand">{discount}% off</b> a home trial</> : null}.
        </p>
      </div>

      <Input
        id="handoff-name"
        placeholder="Your name"
        autoComplete="given-name"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        leftIcon={<User className="h-4 w-4" />}
      />
      <div className="flex items-end gap-2">
        <select
          value={country}
          onChange={(e) => {
            setCountry(e.target.value as CountryCode);
            setError(null);
          }}
          aria-label="Country"
          className="min-h-12 w-28 shrink-0 rounded-[var(--radius-md)] border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-brand focus:outline-none"
        >
          {SUPPORTED_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.flag} {c.iso} {c.dial}
            </option>
          ))}
        </select>
        <div className="flex-1">
          <Input
            id="handoff-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="Mobile number"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            leftIcon={<Phone className="h-4 w-4" />}
          />
        </div>
      </div>
      {countryByIso(country) && phone && !valid && (
        <p className="-mt-2 text-xs text-ink-faint">Enter a valid {countryByIso(country)!.name} mobile number.</p>
      )}
      {error && <p className="rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      <Button
        size="lg"
        fullWidth
        disabled={!valid}
        loading={busy}
        onClick={submit}
        leftIcon={<Sparkles className="h-5 w-5" />}
        rightIcon={<ArrowRight className="h-5 w-5" />}
      >
        Unlock my looks
      </Button>
      <p className="text-center text-[11px] leading-relaxed text-ink-faint">
        By continuing you agree HairOriginals may contact you on this number about your looks and offers.
      </p>
    </section>
  );
}

// ── Step 2: options ──────────────────────────────────────────

function Options({
  token,
  state,
  track,
  onRefresh,
}: {
  token: string;
  state: HandoffState;
  track: (action: Action) => Promise<Response>;
  onRefresh: () => void;
}) {
  const { offer } = state;
  const [offerOpen, setOfferOpen] = useState(false);
  const firstStyle = state.looks[0]?.styleName;

  const waText = [
    "Hi HairOriginals! 👋",
    `I just tried ${firstStyle ? `the ${firstStyle}` : "some styles"}${state.kioskName ? ` at the ${state.kioskName} try-on mirror` : ""}.`,
    state.downloadUrl ? `Here are my looks: ${state.downloadUrl}` : null,
    "I'd like to know more.",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <section className="flex flex-col gap-3">
      <SendPhotos token={token} state={state} onSent={onRefresh} />

      <button
        type="button"
        onClick={() => setOfferOpen(true)}
        className="relative flex items-center gap-4 overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-grad-1 via-grad-2 to-grad-3 p-5 text-left text-white shadow-[var(--shadow-brand)] active:scale-[0.99]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Home className="h-6 w-6" />
        </span>
        <span className="flex-1">
          <span className="block text-base font-extrabold leading-tight">Book a home trial</span>
          <span className="mt-0.5 block text-sm text-white/85">Try the real hair at home — exclusive offer</span>
        </span>
        {offer.discountPercent > 0 && (
          <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-black text-brand">
            {offer.discountPercent}% OFF
          </span>
        )}
      </button>

      <div className="grid grid-cols-2 gap-3">
        {offer.whatsappNumber && (
          <OptionLink
            href={`https://wa.me/${offer.whatsappNumber}?text=${encodeURIComponent(waText)}`}
            onClick={() => track("whatsapp")}
            icon={<MessageCircle className="h-5 w-5" />}
            label="Chat on WhatsApp"
            tone="whatsapp"
          />
        )}
        {offer.contactPhone && (
          <OptionLink
            href={`tel:${offer.contactPhone}`}
            onClick={() => track("call")}
            icon={<Phone className="h-5 w-5" />}
            label="Call an expert"
          />
        )}
        <OptionLink
          href={withUtm(STORE_URL, "explore")}
          onClick={() => track("store")}
          icon={<ShoppingBag className="h-5 w-5" />}
          label="Explore more styles"
          wide={!!offer.whatsappNumber === !!offer.contactPhone}
        />
      </div>

      {offerOpen && (
        <OfferSheet offer={offer} track={track} onClose={() => setOfferOpen(false)} />
      )}
    </section>
  );
}

function SendPhotos({ token, state, onSent }: { token: string; state: HandoffState; onSent: () => void }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch(`/api/handoff/${encodeURIComponent(token)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_photos" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send right now. Please try again.");
        setStatus("idle");
        return;
      }
      if (data?.smsSkipped) {
        setDevLink(data.devLink);
        setMessage("SMS isn't set up yet (development) — here's the link it would send:");
      } else {
        setMessage(`Sent to ${data?.sentTo ?? state.maskedPhone} ✓ Check your messages.`);
      }
      setStatus("sent");
      onSent();
    } catch {
      setError("Couldn't connect. Please try again.");
      setStatus("idle");
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Send className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-base font-bold text-ink">Get your photos by SMS</p>
          <p className="text-sm text-ink-soft">
            We&apos;ll text a download link to {state.maskedPhone ?? "your number"}.
          </p>
        </div>
      </div>
      {message && (
        <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-success-soft px-3 py-2 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span>{message}</span>
        </p>
      )}
      {devLink && (
        <a href={devLink} className="break-all text-sm font-semibold text-brand underline">
          {devLink}
        </a>
      )}
      {error && <p className="rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
      <Button
        fullWidth
        size="lg"
        variant={status === "sent" ? "secondary" : "primary"}
        loading={status === "sending"}
        disabled={state.smsRemaining <= 0 && status !== "sent"}
        onClick={send}
        leftIcon={status === "sent" ? <Check className="h-5 w-5" /> : <Send className="h-5 w-5" />}
      >
        {status === "sent" ? "Send again" : "Send my photos"}
      </Button>
    </div>
  );
}

function OfferSheet({
  offer,
  track,
  onClose,
}: {
  offer: Offer;
  track: (action: Action) => Promise<Response>;
  onClose: () => void;
}) {
  const [claimed, setClaimed] = useState(false);
  const [busy, setBusy] = useState(false);

  const claim = async () => {
    setBusy(true);
    try {
      const res = await track("home_trial");
      if (res.ok) setClaimed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm animate-overlay-in" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-t-[var(--radius-2xl)] bg-surface p-6 pb-safe shadow-[var(--shadow-pop)] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-surface-sunken"
        >
          <X className="h-5 w-5" />
        </button>

        {claimed ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="h-9 w-9" />
            </span>
            <h3 className="text-xl font-extrabold text-ink">Your {offer.discountPercent}% off is locked in!</h3>
            <p className="text-sm text-ink-soft">
              A HairOriginals expert will call you shortly to schedule your home trial.
            </p>
            {offer.couponCode && <Coupon code={offer.couponCode} />}
            <a
              href={withUtm(offer.homeTrialUrl, "home_trial")}
              className="mt-2 text-sm font-semibold text-brand underline underline-offset-4"
            >
              Or book online now
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-2">
            {offer.discountPercent > 0 && (
              <span className="self-start rounded-full bg-brand-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-ink">
                Standee exclusive
              </span>
            )}
            <h3 className="text-xl font-extrabold leading-tight text-ink">{offer.title}</h3>
            <p className="text-sm leading-relaxed text-ink-soft">{offer.text}</p>
            {offer.couponCode && <Coupon code={offer.couponCode} />}
            <Button size="lg" fullWidth loading={busy} onClick={claim} leftIcon={<Home className="h-5 w-5" />}>
              {offer.discountPercent > 0 ? `Claim my ${offer.discountPercent}% off` : "Request a home trial"}
            </Button>
            <p className="text-center text-[11px] text-ink-faint">No payment now — our expert calls you to fix a time.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Coupon({ code }: { code: string }) {
  return (
    <span className="flex items-center gap-2 self-center rounded-[var(--radius-md)] border-2 border-dashed border-brand/50 bg-brand-soft px-4 py-2 font-mono text-base font-bold tracking-widest text-brand-ink">
      <Tag className="h-4 w-4" /> {code}
    </span>
  );
}

function OptionLink({
  href,
  onClick,
  icon,
  label,
  tone,
  wide,
}: {
  href: string;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone?: "whatsapp";
  wide?: boolean;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
      className={cn(
        "flex min-h-[64px] items-center gap-3 rounded-[var(--radius-lg)] border px-4 text-sm font-bold shadow-[var(--shadow-card)] active:scale-[0.98]",
        tone === "whatsapp" ? "border-[#25D366]/30 bg-[#25D366]/10 text-[#128C4B]" : "border-line bg-surface text-ink",
        wide && "col-span-2"
      )}
    >
      {icon}
      {label}
    </a>
  );
}

// ── States ───────────────────────────────────────────────────

function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-5 px-5 pt-16">
      <div className="h-7 w-40 animate-pulse rounded-full bg-surface-sunken" />
      <div className="h-8 w-64 animate-pulse rounded-full bg-surface-sunken" />
      <div className="aspect-[3/4] w-full animate-pulse rounded-[var(--radius-xl)] bg-surface-sunken" />
    </main>
  );
}

function DeadEnd({ reason }: { reason: "expired" | "not_found" | "error" }) {
  const copy = {
    expired: ["This link has expired", "Visit a HairOriginals try-on mirror again to create new looks — or try it online."],
    not_found: ["We couldn't find these looks", "Please scan the QR code on the try-on mirror again."],
    error: ["Something went wrong", "Please check your internet connection and reload this page."],
  }[reason];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-wordmark.png" alt="HairOriginals" className="mb-4 h-7 w-auto" />
      <h1 className="text-xl font-extrabold text-ink">{copy[0]}</h1>
      <p className="text-sm text-ink-soft">{copy[1]}</p>
      <Link href="/" className="mt-4 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white">
        Try on online
      </Link>
    </main>
  );
}
