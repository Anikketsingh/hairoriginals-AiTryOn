"use client";

import { useState, useCallback, useEffect } from "react";
import { Images } from "lucide-react";
import Link from "next/link";
import TopBar from "@/components/flow/TopBar";
import BottomNav from "@/components/BottomNav";
import HomeStep from "@/components/flow/HomeStep";
import PhotoStep from "@/components/flow/PhotoStep";
import StyleStep from "@/components/flow/StyleStep";
import GeneratingStep from "@/components/flow/GeneratingStep";
import ResultStep from "@/components/flow/ResultStep";
import FunnelGate from "@/components/FunnelGate";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/hooks/useSession";
import type { UploadedImage, GenerateResponse } from "@/lib/types";

type Step = "home" | "photo" | "style" | "result";
const STEP_TO_HASH: Record<Step, string> = { home: "", photo: "#photo", style: "#style", result: "#result" };

export default function HomePage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("home");
  const [personImage, setPersonImage] = useState<UploadedImage | undefined>();
  const [productImage, setProductImage] = useState<UploadedImage | undefined>();
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const { sessionToken, refreshStatus } = useSession();
  const [gateStage, setGateStage] = useState<1 | 3 | null>(null);
  const [gateMessage, setGateMessage] = useState("");

  // Sync step → URL hash so the hardware Back button works.
  useEffect(() => {
    const target = STEP_TO_HASH[step];
    if (window.location.hash !== target) {
      window.history.pushState(null, "", target || window.location.pathname);
    }
  }, [step]);

  useEffect(() => {
    const onPop = () => {
      const h = window.location.hash;
      if (h === "#style") setStep("style");
      else if (h === "#photo") setStep("photo");
      else if (h === "#result") setStep("result");
      else setStep("home");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const pollJobStatus = useCallback(
    async (jobId: string) => {
      const POLL_INTERVAL_MS = 1500;
      const MAX_ATTEMPTS = 60;
      let attempts = 0;

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        try {
          const res = await fetch(`/api/generate/status/${jobId}`);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.status === "completed") {
            if (!data.resultImageBase64 || !data.resultMimeType) {
              throw new Error("Job completed but result image payload is missing.");
            }
            setResult({ imageBase64: data.resultImageBase64, mimeType: data.resultMimeType });
            await refreshStatus();
            return;
          } else if (data.status === "failed") {
            throw new Error(data.errorLog || "AI generation failed. Please try again.");
          }
        } catch (pollErr) {
          if (pollErr instanceof Error && pollErr.message.includes("AI generation failed")) throw pollErr;
          // Network flicker — keep polling until timeout.
        }
      }
      throw new Error("Generation timed out. Please try again.");
    },
    [refreshStatus]
  );

  const handleGenerate = useCallback(async () => {
    if (!personImage || !productImage) return;

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      if (personImage.file) formData.append("personImage", personImage.file);
      else throw new Error("Your photo is missing. Please add it again.");
      if (productImage.file) formData.append("productImage", productImage.file);
      else throw new Error("The style photo is missing. Please pick it again.");

      if (sessionToken) formData.append("sessionToken", sessionToken);
      if (productImage.productId) formData.append("productId", productImage.productId);

      const response = await fetch("/api/generate", { method: "POST", body: formData });
      const data = await response.json();

      if ("gate" in data) {
        const gate = data as { gate: "login" | "agent"; message: string; stage: 1 | 3 };
        setGateStage(gate.stage);
        setGateMessage(gate.message);
        setLoading(false);
        return;
      }

      if (!response.ok) throw new Error(data.error ?? "We couldn't create your look. Please try again.");

      if (data.jobId) {
        await pollJobStatus(data.jobId);
        setStep("result");
      } else {
        setResult(data as GenerateResponse);
        setStep("result");
        await refreshStatus();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [personImage, productImage, sessionToken, refreshStatus, pollJobStatus, toast]);

  const handleTryAnother = useCallback(() => {
    setResult(null);
    setProductImage(undefined);
    setStep("style");
  }, []);

  const handleStartOver = useCallback(() => {
    setResult(null);
    setPersonImage(undefined);
    setProductImage(undefined);
    setStep("home");
  }, []);

  const handleAuthComplete = useCallback(async () => {
    setGateStage(null);
    await refreshStatus();
    handleGenerate();
  }, [refreshStatus, handleGenerate]);

  const back = useCallback(() => {
    setStep((s) => (s === "style" ? "photo" : s === "photo" ? "home" : "home"));
  }, []);

  const stepNumber = step === "photo" ? 1 : step === "style" ? 2 : step === "result" ? 3 : undefined;

  return (
    <>
      {/* Chrome */}
      {step === "home" ? (
        <TopBar
          right={
            <Link
              href="/dashboard"
              aria-label="My looks"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-surface-sunken transition"
            >
              <Images className="h-5 w-5" />
            </Link>
          }
        />
      ) : step === "result" ? (
        <TopBar onBack={handleStartOver} step={3} />
      ) : (
        <TopBar onBack={back} step={stepNumber} />
      )}

      <main>
        {step === "home" && <HomeStep onStart={() => setStep("photo")} />}

        {step === "photo" && (
          <PhotoStep personImage={personImage} onSelect={setPersonImage} onContinue={() => setStep("style")} />
        )}

        {step === "style" && (
          <StyleStep productImage={productImage} onSelect={setProductImage} onTryOn={handleGenerate} />
        )}

        {step === "result" && result && (
          <ResultStep
            imageBase64={result.imageBase64}
            mimeType={result.mimeType}
            personImage={personImage?.dataUrl}
            productId={productImage?.productId}
            sessionToken={sessionToken}
            onTryAnother={handleTryAnother}
            onStartOver={handleStartOver}
          />
        )}
      </main>

      {step === "home" && <BottomNav />}

      {/* Loading takes over the screen */}
      {loading && (
        <GeneratingStep personImage={personImage?.dataUrl} productImage={productImage?.dataUrl} />
      )}

      {/* Funnel gate */}
      {gateStage !== null && (
        <FunnelGate
          stage={gateStage}
          message={gateMessage}
          sessionToken={sessionToken}
          onAuthComplete={handleAuthComplete}
          onLeadCreated={() => setGateStage(null)}
          onDismiss={() => setGateStage(null)}
        />
      )}
    </>
  );
}
