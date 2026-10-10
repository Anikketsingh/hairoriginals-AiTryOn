"use client";

/**
 * /kiosk/enroll?code=XXXX — one-time standee registration.
 *
 * Opened on the standee itself (during setup, before lockdown) from the
 * link shown in Admin → Kiosks. Posts the code to /api/kiosk/enroll, which
 * sets the device cookie, then hands over to /kiosk. The code can also be
 * typed in manually if the link was easier to read off a screen.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function EnrollForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [status, setStatus] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  const enroll = async (value: string) => {
    setStatus("busy");
    setError(null);
    try {
      const res = await fetch("/api/kiosk/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Enrollment failed.");
        setStatus("idle");
        return;
      }
      setStatus("done");
      setTimeout(() => router.replace("/kiosk"), 1500);
    } catch {
      setError("Couldn't reach the server. Check the internet connection.");
      setStatus("idle");
    }
  };

  useEffect(() => {
    const fromUrl = params.get("code");
    if (fromUrl && !autoTried.current) {
      autoTried.current = true;
      void enroll(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the link's code
  }, []);

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 px-8 text-center">
      <h1 className="text-4xl font-semibold">Register this kiosk</h1>
      {status === "done" ? (
        <p className="text-2xl text-success">Registered. Starting the kiosk…</p>
      ) : (
        <>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ENROLLMENT CODE"
            className="w-[480px] max-w-full rounded-2xl border border-line-strong bg-surface px-6 py-5 text-3xl tracking-widest text-center select-text"
          />
          <button
            onClick={() => enroll(code)}
            disabled={status === "busy" || code.trim().length < 6}
            className="rounded-full bg-brand text-white text-2xl font-medium px-12 py-5 disabled:opacity-40"
          >
            {status === "busy" ? "Registering…" : "Register"}
          </button>
          {error && <p className="text-danger text-xl max-w-xl">{error}</p>}
        </>
      )}
    </div>
  );
}

export default function KioskEnrollPage() {
  return (
    <Suspense>
      <EnrollForm />
    </Suspense>
  );
}
