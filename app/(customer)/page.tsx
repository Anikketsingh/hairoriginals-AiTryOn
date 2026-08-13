"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import TopBar from "@/components/flow/TopBar";
import BottomNav from "@/components/BottomNav";
import HomeStep from "@/components/flow/HomeStep";
import PhotoStep from "@/components/flow/PhotoStep";
import StyleStep from "@/components/flow/StyleStep";
import CustomizeStep from "@/components/flow/CustomizeStep";
import GeneratingStep from "@/components/flow/GeneratingStep";
import ResultStep from "@/components/flow/ResultStep";
import FunnelGate from "@/components/FunnelGate";
import FeedbackSheet from "@/components/FeedbackSheet";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/hooks/useSession";
import type {
  UploadedImage,
  GenerateResponse,
  Product,
  CustomizationAttribute,
  ProductCustomizationResponse,
} from "@/lib/types";

type Step = "home" | "photo" | "style" | "customize" | "result";
const STEP_TO_HASH: Record<Step, string> = {
  home: "",
  photo: "#photo",
  style: "#style",
  customize: "#customize",
  result: "#result",
};

// Post-trial feedback: shown once after a logged-in customer's first try-on,
// re-prompted once if skipped, then never again on this device.
const FEEDBACK_SHOWN_KEY = "hair_feedback_shown";
const FEEDBACK_DONE_KEY = "hair_feedback_done";
const FEEDBACK_MAX_PROMPTS = 2;

export default function HomePage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("home");
  const [personImage, setPersonImage] = useState<UploadedImage | undefined>();
  const [productImage, setProductImage] = useState<UploadedImage | undefined>();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [customizationAttributes, setCustomizationAttributes] = useState<CustomizationAttribute[]>([]);
  const [customizationSelections, setCustomizationSelections] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const { sessionToken, sessionStatus, refreshStatus } = useSession();
  const [gateStage, setGateStage] = useState<1 | 3 | null>(null);
  const [gateMessage, setGateMessage] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Sync step → URL hash so the hardware Back button works. Returning to the
  // home step has no hash, so the URL is rebuilt by hand — and must keep the
  // query string, or an ad click's ?utm_*/&fbclid params are wiped the first
  // time the customer steps back (see components/AttributionCapture.tsx).
  useEffect(() => {
    const target = STEP_TO_HASH[step];
    if (window.location.hash !== target) {
      window.history.pushState(
        null,
        "",
        target || `${window.location.pathname}${window.location.search}`
      );
    }
  }, [step]);

  useEffect(() => {
    const onPop = () => {
      const h = window.location.hash;
      // A direct/refreshed deep link to #customize with nothing selected
      // (or a product with nothing to customize) has no screen to show —
      // fall back to style rather than rendering an empty customize step.
      if (h === "#customize") setStep(customizationAttributes.length > 0 ? "customize" : "style");
      else if (h === "#style") setStep("style");
      else if (h === "#photo") setStep("photo");
      else if (h === "#result") setStep("result");
      else setStep("home");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [customizationAttributes.length]);

  // Open the home screen already scrolled past the header. On mobile the home
  // chrome scrolls away with the page (TopBar makes it absolute, not fixed),
  // so the hero — not the logo bar — is the first thing in view. Runs once on
  // load only; lg+ keeps the header pinned, so there's nothing to scroll past.
  const openedPastHeader = useRef(false);
  useEffect(() => {
    if (openedPastHeader.current || step !== "home") return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    const header = document.querySelector("header");
    if (!header) return;
    openedPastHeader.current = true;
    // `scroll-behavior: smooth` is global; this one must land instantly.
    window.scrollTo({ top: header.offsetHeight, behavior: "instant" });
  }, [step]);

  const pollJobStatus = useCallback(
    async (jobId: string, token: string) => {
      const POLL_INTERVAL_MS = 1500;
      const MAX_ATTEMPTS = 60;
      let attempts = 0;

      while (attempts < MAX_ATTEMPTS) {
        if (cancelledRef.current) return;
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (cancelledRef.current) return;
        try {
          const res = await fetch(
            `/api/generate/status/${jobId}?sessionToken=${encodeURIComponent(token)}`
          );
          if (!res.ok) continue;
          const data = await res.json();
          if (data.status === "completed") {
            if (!data.resultUrl || !data.resultMimeType) {
              throw new Error("Job completed but result image payload is missing.");
            }
            setResult({ imageUrl: data.resultUrl, mimeType: data.resultMimeType });
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

  // After a logged-in customer completes a try-on, prompt for quick feedback.
  // Source of truth for "already submitted" is the server (survives across
  // devices); the per-device counter caps it at "once, plus one re-prompt".
  const maybePromptFeedback = useCallback(async () => {
    if (!sessionToken || !sessionStatus?.userId) return;
    try {
      if (localStorage.getItem(FEEDBACK_DONE_KEY) === "1") return;
      const shown = Number(localStorage.getItem(FEEDBACK_SHOWN_KEY) ?? "0");
      if (shown >= FEEDBACK_MAX_PROMPTS) return;

      const res = await fetch(`/api/customer/feedback?sessionToken=${encodeURIComponent(sessionToken)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.submitted) {
          localStorage.setItem(FEEDBACK_DONE_KEY, "1");
          return;
        }
      }

      localStorage.setItem(FEEDBACK_SHOWN_KEY, String(shown + 1));
      setFeedbackOpen(true);
    } catch {
      // Never block the result screen on a feedback check.
    }
  }, [sessionToken, sessionStatus?.userId]);

  // `demo === true` skips the paid Gemini call (dev only — see the demo
  // button below). Note this is passed as `onTryOn` to StyleStep, whose
  // onClick hands us a MouseEvent; the strict `=== true` check keeps a real
  // Try On tap from being mistaken for a demo run.
  const handleGenerate = useCallback(async (demo?: boolean) => {
    if (!personImage || !productImage) return;
    const isDemo = demo === true;

    setLoading(true);
    setResult(null);
    setGenerationId(null);
    cancelledRef.current = false;

    try {
      const formData = new FormData();
      if (personImage.file) formData.append("personImage", personImage.file);
      else throw new Error("Your photo is missing. Please add it again.");
      if (productImage.file) formData.append("productImage", productImage.file);
      else throw new Error("The style photo is missing. Please pick it again.");

      if (sessionToken) formData.append("sessionToken", sessionToken);
      if (productImage.productId) formData.append("productId", productImage.productId);
      if (isDemo) formData.append("demo", "true");

      const customizationOptionIds = Object.values(customizationSelections);
      if (customizationOptionIds.length > 0) {
        formData.append("customizationOptionIds", JSON.stringify(customizationOptionIds));
      }

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
        setGenerationId(data.jobId);
        await pollJobStatus(data.jobId, sessionToken ?? "");
        if (cancelledRef.current) return;
        setStep("result");
        void maybePromptFeedback();
      } else {
        setResult(data as GenerateResponse);
        setStep("result");
        await refreshStatus();
        void maybePromptFeedback();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [personImage, productImage, sessionToken, customizationSelections, refreshStatus, pollJobStatus, toast, maybePromptFeedback]);

  const handleStyleSelect = useCallback(async (img: UploadedImage | undefined, product?: Product) => {
    setProductImage(img);
    setSelectedProduct(product ?? null);
    setCustomizationSelections({});

    // Prefetch inside the same spinner StyleStep already shows while it
    // downloads the product image — "Try this on" stays instant either way.
    // Every failure mode (disabled product, fetch error, bad response)
    // resolves to an empty array, which is what makes a non-configured
    // product silently skip the customize screen.
    if (!product?.customization_enabled) {
      setCustomizationAttributes([]);
      return;
    }
    try {
      const res = await fetch(`/api/products/${product.id}/customization`);
      if (!res.ok) throw new Error("Failed to load customization options.");
      const data: ProductCustomizationResponse = await res.json();
      setCustomizationAttributes(data.attributes);
      const initialSelections: Record<string, string> = {};
      for (const attribute of data.attributes) {
        if (attribute.options[0]) initialSelections[attribute.key] = attribute.options[0].id;
      }
      setCustomizationSelections(initialSelections);
    } catch (err) {
      console.error("[HomePage] customization fetch failed:", err);
      setCustomizationAttributes([]);
    }
  }, []);

  const handleCustomizationSelect = useCallback((attributeKey: string, optionId: string) => {
    setCustomizationSelections((prev) => ({ ...prev, [attributeKey]: optionId }));
  }, []);

  // Branches after "Try this on" on the style grid: skip straight to
  // generation for products with nothing to customize (today's exact
  // behavior), otherwise show the customize step first.
  const handleStyleContinue = useCallback(() => {
    if (customizationAttributes.length > 0) {
      setStep("customize");
    } else {
      handleGenerate();
    }
  }, [customizationAttributes, handleGenerate]);

  const handleCancelGenerate = useCallback(() => {
    cancelledRef.current = true;
    setLoading(false);
    setStep(customizationAttributes.length > 0 ? "customize" : "style");
  }, [customizationAttributes]);

  const handleTryAnother = useCallback(() => {
    setResult(null);
    setProductImage(undefined);
    setSelectedProduct(null);
    setCustomizationAttributes([]);
    setCustomizationSelections({});
    setStep("style");
  }, []);

  const handleStartOver = useCallback(() => {
    setResult(null);
    setPersonImage(undefined);
    setProductImage(undefined);
    setSelectedProduct(null);
    setCustomizationAttributes([]);
    setCustomizationSelections({});
    setStep("home");
  }, []);

  const handleAuthComplete = useCallback(async () => {
    setGateStage(null);
    await refreshStatus();
    handleGenerate();
  }, [refreshStatus, handleGenerate]);

  const back = useCallback(() => {
    setStep((s) => (s === "customize" ? "style" : s === "style" ? "photo" : s === "photo" ? "home" : "home"));
  }, []);

  // "customize" is a sub-screen of "Style" on the shared 3-step indicator —
  // it reports the same position rather than growing FLOW_STEPS to 4, which
  // would make the stepper product-dependent for the common case.
  const stepNumber = step === "photo" ? 1 : step === "style" || step === "customize" ? 2 : step === "result" ? 3 : undefined;

  return (
    <>
      {/* Chrome */}
      {step === "home" ? (
        <TopBar home />
      ) : step === "result" ? (
        <TopBar onBack={handleStartOver} step={3} />
      ) : (
        <TopBar onBack={back} step={stepNumber} />
      )}

      <main>
        {step === "home" && <HomeStep onStart={() => setStep("photo")} />}

        {step === "photo" && (
          <PhotoStep
            personImage={personImage}
            sessionToken={sessionToken}
            onSelect={setPersonImage}
            onContinue={() => setStep("style")}
          />
        )}

        {step === "style" && (
          <StyleStep
            productImage={productImage}
            sessionToken={sessionToken}
            onSelect={handleStyleSelect}
            onTryOn={handleStyleContinue}
          />
        )}

        {step === "customize" && (
          <CustomizeStep
            productImage={productImage}
            product={selectedProduct}
            attributes={customizationAttributes}
            selections={customizationSelections}
            onSelect={handleCustomizationSelect}
            onTryOn={handleGenerate}
          />
        )}

        {step === "result" && result && (
          <ResultStep
            imageUrl={result.imageUrl}
            mimeType={result.mimeType}
            personImage={personImage?.dataUrl}
            product={selectedProduct}
            generationId={generationId}
            sessionToken={sessionToken}
            onTryAnother={handleTryAnother}
            onStartOver={handleStartOver}
          />
        )}
      </main>

      {step === "home" && <BottomNav onCta={() => setStep("photo")} />}

      {/* Loading takes over the screen */}
      {loading && (
        <GeneratingStep
          personImage={personImage?.dataUrl}
          productImage={productImage?.dataUrl}
          onCancel={handleCancelGenerate}
        />
      )}

      {/* DEV ONLY: skip the paid Gemini call but walk the whole flow.
          Never rendered in a production build, and the backend also refuses
          the demo flag outside development. */}
      {process.env.NODE_ENV !== "production" && step === "style" && !loading && (
        <button
          type="button"
          onClick={() => handleGenerate(true)}
          disabled={!personImage || !productImage}
          className="fixed bottom-24 right-4 z-40 rounded-full border border-dashed border-amber-500 bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900 shadow-lg transition active:scale-95 disabled:opacity-40"
        >
          Demo · skip AI
        </button>
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

      {/* Post-trial feedback */}
      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        sessionToken={sessionToken}
        generationId={generationId}
        product={selectedProduct}
        onSubmitted={() => {
          try {
            localStorage.setItem(FEEDBACK_DONE_KEY, "1");
          } catch {
            /* ignore storage errors */
          }
        }}
      />
    </>
  );
}
