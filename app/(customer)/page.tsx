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
import AiScanOverlay from "@/components/flow/AiScanOverlay";
import AiPickSheet from "@/components/flow/AiPickSheet";
import FunnelGate from "@/components/FunnelGate";
import FeedbackSheet from "@/components/FeedbackSheet";
import { useToast } from "@/components/ui/Toast";
import { useSession } from "@/hooks/useSession";
import { urlToUploadedImage, downscaleImage } from "@/lib/image";
// TEMPORARY instrumentation — see lib/debug-timing.ts
import { createTimer } from "@/lib/debug-timing";
import { trackAnalyticsEvent } from "@/lib/analytics-client";
import type {
  UploadedImage,
  GenerateResponse,
  Product,
  CustomizationAttribute,
  ProductCustomizationResponse,
  SuggestResponse,
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

// Floor on how long the AI Stylist scan animation stays up, so a fast response
// doesn't flash past. Only applied on success — errors surface immediately.
const MIN_SCAN_MS = 2500;

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

  // AI Stylist (see components/flow/AiScanOverlay + AiPickSheet). The scan
  // itself costs no credit — it only pre-fills the selection the customer
  // would otherwise have made by tapping a card on the style grid.
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [pickingProductId, setPickingProductId] = useState<string | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);

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

  // `demo: true` skips the paid Gemini call (dev only — see the demo button
  // below). `productOverride` lets a caller that just resolved a product image
  // generate with it immediately, without waiting a render for setProductImage
  // to land (the AI Stylist pick does exactly that).
  //
  // Note this is passed as `onTryOn` to CustomizeStep, whose onClick hands us a
  // MouseEvent. A MouseEvent has neither `.demo` nor `.productOverride`, so the
  // strict `=== true` check and the `??` fallback both keep a real Try On tap
  // behaving exactly as before.
  const handleGenerate = useCallback(async (opts?: {
    demo?: boolean;
    productOverride?: UploadedImage;
    customizationOverride?: Record<string, string>;
  }) => {
    const product = opts?.productOverride ?? productImage;
    // `??` not `||`, so an explicit empty object means "no customizations"
    // rather than falling back to the previous product's selections.
    const selections = opts?.customizationOverride ?? customizationSelections;
    if (!personImage || !product) return;
    const isDemo = opts?.demo === true;

    setLoading(true);
    setResult(null);
    setGenerationId(null);
    cancelledRef.current = false;
    const t = createTimer("generate:client"); // TEMPORARY

    try {
      const formData = new FormData();
      if (personImage.file) formData.append("personImage", personImage.file);
      else throw new Error("Your photo is missing. Please add it again.");
      if (product.file) formData.append("productImage", product.file);
      else throw new Error("The style photo is missing. Please pick it again.");

      if (sessionToken) formData.append("sessionToken", sessionToken);
      if (product.productId) formData.append("productId", product.productId);
      if (isDemo) formData.append("demo", "true");

      const customizationOptionIds = Object.values(selections);
      if (customizationOptionIds.length > 0) {
        formData.append("customizationOptionIds", JSON.stringify(customizationOptionIds));
      }

      t.mark("build-formdata");
      const response = await fetch("/api/generate", { method: "POST", body: formData });
      const data = await response.json();
      t.mark("post-generate");

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
        t.mark("poll-until-complete");
        t.log();
        if (cancelledRef.current) return;
        setStep("result");
        void maybePromptFeedback();
      } else {
        t.log();
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

  // Returns the resolved attributes as well as storing them. A caller that
  // needs to branch on them immediately (handleAiPick) can't read the state it
  // just set — that's still the previous render's value — so it takes the
  // return value instead. Callers that don't care simply ignore it.
  const handleStyleSelect = useCallback(async (
    img: UploadedImage | undefined,
    product?: Product
  ): Promise<CustomizationAttribute[]> => {
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
      return [];
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
      return data.attributes;
    } catch (err) {
      console.error("[HomePage] customization fetch failed:", err);
      setCustomizationAttributes([]);
      return [];
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

  // ── AI Stylist ───────────────────────────────────────────────
  // Scans the customer's photo and opens a ranked shortlist. Costs no credit
  // and touches none of the generation state — every failure mode leaves the
  // customer on the style grid to pick by hand exactly as before.
  const handleAiSuggest = useCallback(async () => {
    if (!personImage?.file) return;

    const controller = new AbortController();
    suggestAbortRef.current = controller;
    setSuggesting(true);
    const t = createTimer("suggest:client"); // TEMPORARY

    try {
      // Shrunk before upload — a full-size phone photo makes the vision call
      // several times slower for no extra accuracy (see downscaleImage).
      const scanFile = personImage.dataUrl
        ? await downscaleImage(personImage.dataUrl, personImage.file)
        : personImage.file;
      t.mark(
        `compress(${Math.round((personImage.file.size ?? 0) / 1024)}KB→${Math.round(scanFile.size / 1024)}KB)`
      );

      const formData = new FormData();
      formData.append("personImage", scanFile);
      if (sessionToken) formData.append("sessionToken", sessionToken);
      try {
        const gender = localStorage.getItem("ho_selected_gender");
        if (gender) formData.append("gender", gender);
      } catch {
        /* Storage unavailable — the server defaults the gender. */
      }

      // The analysis can come back in ~2s, fast enough that the scan animation
      // would flash. Started now and awaited only on success, so a failure
      // surfaces immediately instead of sitting behind the animation.
      const holdUntilMinimum = new Promise((resolve) => setTimeout(resolve, MIN_SCAN_MS));

      const response = await fetch("/api/suggest", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      t.mark("request");
      if (controller.signal.aborted) return;

      const data = await response.json();
      t.mark("parse-json");
      if (!response.ok) throw new Error(data.error ?? "We couldn't finish the scan.");
      if (data.noFace) {
        toast(data.message, "error");
        return;
      }

      await holdUntilMinimum;
      t.mark("animation-hold");
      if (controller.signal.aborted) return;

      setSuggestion(data as SuggestResponse);
      setSuggestOpen(true);
      t.log();
    } catch (err: unknown) {
      // An abort is the customer cancelling, not a failure worth a toast.
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "We couldn't finish the scan.";
      toast(message, "error");
    } finally {
      if (suggestAbortRef.current === controller) suggestAbortRef.current = null;
      setSuggesting(false);
    }
  }, [personImage, sessionToken, toast]);

  const handleCancelSuggest = useCallback(() => {
    suggestAbortRef.current?.abort();
    suggestAbortRef.current = null;
    setSuggesting(false);
  }, []);

  // Hands the AI's pick to the exact path a manual tap on a style card takes.
  const handleAiPick = useCallback(
    async (product: Product, rank: number) => {
      setPickingProductId(product.id);
      const t = createTimer("ai-pick:client"); // TEMPORARY
      try {
        trackAnalyticsEvent("ai_suggest_picked", { productId: product.id, rank }, sessionToken);
        const img = await urlToUploadedImage(product.image_url, `${product.slug}.jpg`, product.id);
        t.mark("download-product-image");
        const attributes = await handleStyleSelect(img, product);
        t.mark("customization-prefetch");
        t.log(`attributes=${attributes.length}`);
        setSuggestOpen(false);
        if (attributes.length > 0) setStep("customize");
        // No attributes resolved → send no customizations. Explicit, because
        // the reset inside handleStyleSelect hasn't rendered yet and the
        // previous product's option ids can be shared with this one.
        else await handleGenerate({ productOverride: img, customizationOverride: {} });
      } catch (err) {
        console.error("[HomePage] AI pick failed:", err);
        toast("We couldn't load that style. Please try another.", "error");
      } finally {
        setPickingProductId(null);
      }
    },
    [sessionToken, handleStyleSelect, handleGenerate, toast]
  );

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
    // The shortlist was for the look they just tried; keep the scan itself
    // available but don't reopen a stale sheet over the grid.
    setSuggestion(null);
    setSuggestOpen(false);
    setStep("style");
  }, []);

  const handleStartOver = useCallback(() => {
    setResult(null);
    setPersonImage(undefined);
    setProductImage(undefined);
    setSelectedProduct(null);
    setCustomizationAttributes([]);
    setCustomizationSelections({});
    // A new photo invalidates the analysis entirely.
    setSuggestion(null);
    setSuggestOpen(false);
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
            canAiSuggest={!!personImage?.file}
            aiBusy={suggesting}
            onAiPick={handleAiSuggest}
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

      {/* AI Stylist scan takes over the screen the same way */}
      {suggesting && (
        <AiScanOverlay personImage={personImage?.dataUrl} onCancel={handleCancelSuggest} />
      )}

      {/* DEV ONLY: skip the paid Gemini call but walk the whole flow.
          Never rendered in a production build, and the backend also refuses
          the demo flag outside development. */}
      {process.env.NODE_ENV !== "production" && step === "style" && !loading && (
        <button
          type="button"
          onClick={() => handleGenerate({ demo: true })}
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

      {/* AI Stylist shortlist */}
      <AiPickSheet
        open={suggestOpen}
        suggestion={suggestion}
        busyProductId={pickingProductId}
        onPick={handleAiPick}
        onClose={() => setSuggestOpen(false)}
      />

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
