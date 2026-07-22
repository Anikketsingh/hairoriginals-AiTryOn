"use client";

/**
 * components/FunnelGate.tsx
 *
 * Bottom-sheet gates for the generation funnel:
 *   Stage 1 — Login Gate: Phone OTP sign-in (phone → OTP)
 *   Stage 3 — Agent Gate: message + "Connect with a Stylist" CTA
 *
 * Uses supabaseClient from lib/supabase/client.ts for auth calls.
 */

import { useState, useCallback } from "react";
import { Phone, KeyRound, Sparkles, MessageCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { supabaseClient } from "@/lib/supabase/client";
import { trackPixelEvent, newPixelEventId } from "@/lib/meta-pixel";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface FunnelGateProps {
  stage: 1 | 3;
  message: string;
  sessionToken: string | null;
  onAuthComplete: () => void;
  onLeadCreated: () => void;
  onDismiss: () => void;
}

// ── Stage 1: Login Gate ─────────────────────────────────────────

type OtpStep = "phone" | "otp" | "loading" | "done";

function LoginGate({
  message,
  sessionToken,
  onAuthComplete,
  onDismiss,
}: {
  message: string;
  sessionToken: string | null;
  onAuthComplete: () => void;
  onDismiss: () => void;
}) {
  const [step, setStep] = useState<OtpStep>("phone");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fullPhone = `${countryCode}${phone.replace(/\D/g, "")}`;

  const handleSendOtp = useCallback(async () => {
    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const { error: authError } = await supabaseClient.auth.signInWithOtp({ phone: fullPhone });
      if (authError) throw authError;
      setStep("otp");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code.");
    } finally {
      setIsLoading(false);
    }
  }, [phone, fullPhone]);

  const handleVerifyOtp = useCallback(async () => {
    if (!otp.trim()) {
      setError("Please enter the code we sent you.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const { data, error: verifyError } = await supabaseClient.auth.verifyOtp({
        phone: fullPhone,
        token: otp,
        type: "sms",
      });
      if (verifyError) throw verifyError;

      // Fire the Meta 'Schedule' event the moment the OTP is verified. The
      // shared eventId dedups this browser event against the server-side
      // Conversions API twin sent from /api/auth/complete.
      const eventId = newPixelEventId();
      trackPixelEvent("Schedule", {}, eventId);

      setStep("loading");
      const accessToken = data.session?.access_token;
      if (accessToken && sessionToken) {
        await fetch("/api/auth/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ sessionToken, eventId }),
        });
      }
      setStep("done");
      setTimeout(onAuthComplete, 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "That code didn't work. Try again.");
      setIsLoading(false);
    }
  }, [otp, fullPhone, sessionToken, onAuthComplete]);

  if (step === "done") {
    return (
      <Sheet open onClose={onDismiss} hideHeader>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle className="h-7 w-7 text-success" />
          </div>
          <p className="text-lg font-bold text-ink">You&apos;re in!</p>
          <p className="text-sm text-ink-soft">Unlocking your free try-ons…</p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onDismiss} hideHeader>
      <div className="flex flex-col gap-5 pt-2">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-bold text-ink">Sign in to keep going</p>
            <p className="text-xs text-ink-soft">Get unlimited tries after signing in</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-ink-soft">{message}</p>

        {step === "phone" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-label="Country code"
                className="min-h-12 w-24 shrink-0 rounded-[var(--radius-md)] border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-brand focus:outline-none"
              >
                <option value="+91">🇮🇳 +91</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+971">🇦🇪 +971</option>
                <option value="+65">🇸🇬 +65</option>
              </select>
              <div className="flex-1">
                <Input
                  id="phone-input"
                  type="tel"
                  inputMode="numeric"
                  placeholder="Mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                  leftIcon={<Phone className="h-4 w-4" />}
                  autoFocus
                />
              </div>
            </div>
            {error && <p className="rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
            <Button size="lg" fullWidth loading={isLoading} disabled={!phone.trim()} onClick={handleSendOtp} leftIcon={<Phone className="h-5 w-5" />}>
              Send code
            </Button>
          </div>
        )}

        {(step === "otp" || step === "loading") && (
          <div className="flex flex-col gap-4">
            <button
              onClick={() => {
                setStep("phone");
                setOtp("");
                setError(null);
              }}
              className="flex w-fit items-center gap-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Change number
            </button>
            <Input
              id="otp-input"
              label={`Enter the code sent to ${countryCode} ${phone}`}
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
              leftIcon={<KeyRound className="h-4 w-4" />}
              className="tracking-widest"
              autoFocus
            />
            {error && <p className="rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
            <Button size="lg" fullWidth loading={isLoading || step === "loading"} disabled={otp.length < 6} onClick={handleVerifyOtp} leftIcon={<KeyRound className="h-5 w-5" />}>
              Verify &amp; unlock
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ── Stage 3: Agent Gate ─────────────────────────────────────────

function AgentGate({
  message,
  sessionToken,
  onLeadCreated,
  onDismiss,
}: {
  message: string;
  sessionToken: string | null;
  onLeadCreated: () => void;
  onDismiss: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    if (!sessionToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, source: "agent_gate" }),
      });
      if (!res.ok) throw new Error("Failed to submit.");
      setSubmitted(true);
      setTimeout(onLeadCreated, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }, [sessionToken, onLeadCreated]);

  return (
    <Sheet open onClose={onDismiss} hideHeader>
      {!submitted ? (
        <div className="flex flex-col gap-5 pt-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold text-ink">You&apos;ve explored our looks!</p>
              <p className="text-xs text-ink-soft">Ready for a personal recommendation?</p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-ink-soft">{message}</p>

          <div className="flex flex-wrap gap-2">
            {["Hair Toppers", "Wigs", "Extensions"].map((cat) => (
              <span key={cat} className="rounded-full border border-line bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                {cat}
              </span>
            ))}
          </div>

          {error && <p className="rounded-[var(--radius-sm)] bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

          <Button size="lg" fullWidth loading={isLoading} onClick={handleConnect} leftIcon={<MessageCircle className="h-5 w-5" />}>
            Connect me with a stylist
          </Button>
          <p className="text-center text-[11px] text-ink-faint">A HairOriginals stylist will reach out shortly.</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle className="h-7 w-7 text-success" />
          </div>
          <p className="text-lg font-bold text-ink">You&apos;re on the list!</p>
          <p className="text-sm leading-relaxed text-ink-soft">
            A HairOriginals stylist will contact you to help find your perfect hair match.
          </p>
        </div>
      )}
    </Sheet>
  );
}

// ── Main export ─────────────────────────────────────────────────

export default function FunnelGate(props: FunnelGateProps) {
  if (props.stage === 1) {
    return (
      <LoginGate
        message={props.message}
        sessionToken={props.sessionToken}
        onAuthComplete={props.onAuthComplete}
        onDismiss={props.onDismiss}
      />
    );
  }
  return (
    <AgentGate
      message={props.message}
      sessionToken={props.sessionToken}
      onLeadCreated={props.onLeadCreated}
      onDismiss={props.onDismiss}
    />
  );
}
