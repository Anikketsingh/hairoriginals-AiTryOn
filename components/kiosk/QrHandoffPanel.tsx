"use client";

/**
 * Full-screen QR panel on the standee. The visitor scans it to open
 * /s/<token> on their phone. Polls /api/kiosk/handoff/status every 2s and
 * shows progress live: waiting → opened on your phone → done.
 *
 * mode "exit" is the last-chance prompt shown when they tap "I'm done"
 * without having taken their looks: same QR, plus a "No thanks" way out.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Home, Loader2, ScanLine, Smartphone, Send } from "lucide-react";
import KioskQr from "@/components/kiosk/KioskQr";
import { GlassButton } from "@/components/kiosk/ui";

const POLL_MS = 2000;
/** After the number arrives, linger on the success state this long. */
const SUCCESS_HOLD_MS = 5000;

type Status = "waiting" | "scanned" | "claimed";

export default function QrHandoffPanel({
  url,
  token,
  mode,
  discountPercent,
  onActivity,
  onClaimed,
  onClose,
}: {
  url: string | null;
  token: string | null;
  mode: "result" | "exit";
  discountPercent: number;
  /** Called while the visitor is busy on their phone, to hold off the idle reset. */
  onActivity: () => void;
  /** Number received — the standee can wrap up the visit. */
  onClaimed: () => void;
  /** "Back to my look" (result) or "No thanks" (exit). */
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>("waiting");
  const onActivityRef = useRef(onActivity);
  const onClaimedRef = useRef(onClaimed);
  useEffect(() => {
    onActivityRef.current = onActivity;
    onClaimedRef.current = onClaimed;
  }, [onActivity, onClaimed]);

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let doneTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/kiosk/handoff/status?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const s = (await res.json()) as { scanned: boolean; claimed: boolean };
        if (stopped) return;
        if (s.claimed) {
          setStatus("claimed");
          stopped = true;
          clearInterval(interval);
          doneTimer = setTimeout(() => onClaimedRef.current(), SUCCESS_HOLD_MS);
        } else if (s.scanned) {
          setStatus("scanned");
          onActivityRef.current();
        }
      } catch {
        // Network blip — the next poll will catch up.
      }
    };

    const interval = setInterval(poll, POLL_MS);
    const first = setTimeout(poll, 0);
    return () => {
      stopped = true;
      clearInterval(interval);
      clearTimeout(first);
      if (doneTimer) clearTimeout(doneTimer);
    };
  }, [token]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center bg-[#141012]/95 px-14 pt-[5vh] text-white backdrop-blur-2xl animate-fade-in">
      <h2 className="text-center text-[60px] font-extrabold leading-tight tracking-tight">
        {mode === "exit" ? "Don't leave without your photos!" : "Scan to get your looks"}
      </h2>
      <p className="mt-4 text-center text-[30px] text-white/70">
        Point your phone camera at the code — no app needed
      </p>

      <div className="relative mt-[4vh] rounded-[56px] bg-white p-10 shadow-[0_30px_100px_rgba(185,89,92,0.45)]">
        {url ? (
          <KioskQr value={url} size={520} />
        ) : (
          <div className="flex h-[520px] w-[520px] items-center justify-center text-ink-soft">
            <Loader2 className="h-20 w-20 animate-spin" />
          </div>
        )}
        {status === "claimed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 rounded-[56px] bg-white/95 text-ink animate-scale-in">
            <span className="flex h-36 w-36 items-center justify-center rounded-full bg-success text-white">
              <Check className="h-24 w-24 stroke-[3]" />
            </span>
            <p className="text-[44px] font-extrabold">All set!</p>
            <p className="text-[28px] text-ink-soft">Check your phone 🎉</p>
          </div>
        )}
      </div>

      <StatusPill status={status} />

      <div className="mt-[4vh] grid w-full max-w-[920px] grid-cols-3 gap-6">
        <Step n={1} icon={<ScanLine className="h-12 w-12" />} label="Scan the code" active={status === "waiting"} done={status !== "waiting"} />
        <Step n={2} icon={<Smartphone className="h-12 w-12" />} label="Enter your number" active={status === "scanned"} done={status === "claimed"} />
        <Step n={3} icon={<Send className="h-12 w-12" />} label="Get photos by SMS" active={false} done={status === "claimed"} />
      </div>

      {discountPercent > 0 && status !== "claimed" && (
        <p className="mt-[3vh] flex items-center gap-3 rounded-full bg-white/10 px-8 py-4 text-[28px] font-semibold">
          <Home className="h-9 w-9 text-[#f6b7b9]" /> Plus an exclusive <b>{discountPercent}% off</b> your home trial
        </p>
      )}

      <div className="mt-auto pb-[5vh]">
        {status !== "claimed" && (
          <GlassButton size="md" onClick={onClose}>
            {mode === "exit" ? (
              "No thanks, I'm done"
            ) : (
              <>
                <ArrowLeft className="h-9 w-9" /> Back to my look
              </>
            )}
          </GlassButton>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const copy: Record<Status, string> = {
    waiting: "Waiting for you to scan…",
    scanned: "Opened on your phone ✓  Enter your number there",
    claimed: "Number received — your photos are on the way",
  };
  return (
    <p className="mt-[3vh] flex items-center gap-4 rounded-full border border-white/15 bg-white/10 px-9 py-4 text-[28px] font-semibold">
      <span
        className={`h-4 w-4 rounded-full ${
          status === "waiting" ? "animate-pulse bg-white/60" : status === "scanned" ? "animate-pulse bg-amber-300" : "bg-emerald-400"
        }`}
      />
      {copy[status]}
    </p>
  );
}

function Step({
  n,
  icon,
  label,
  active,
  done,
}: {
  n: number;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-4 rounded-[40px] border px-6 py-8 text-center transition-colors ${
        done ? "border-emerald-400/40 bg-emerald-400/10" : active ? "border-white/40 bg-white/15" : "border-white/10 bg-white/5"
      }`}
    >
      <span className="relative">
        {icon}
        <span
          className={`absolute -right-5 -top-4 flex h-10 w-10 items-center justify-center rounded-full text-[22px] font-black ${
            done ? "bg-emerald-400 text-ink" : "bg-white text-ink"
          }`}
        >
          {done ? <Check className="h-6 w-6 stroke-[3]" /> : n}
        </span>
      </span>
      <span className="text-[26px] font-semibold leading-tight">{label}</span>
    </div>
  );
}
