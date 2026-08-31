// ──────────────────────────────────────────────────────────────
// Image upload types
// ──────────────────────────────────────────────────────────────

export interface UploadedImage {
  file?: File;
  dataUrl?: string;
  base64: string;
  mimeType: string;
  productId?: string; // Set if selected from catalog
}

// ──────────────────────────────────────────────────────────────
// Catalog Types (Phase 3)
// ──────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  gender: "women" | "men" | "unisex" | "kids";
  display_order: number;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  banner_url: string | null;
  display_order: number;
}

export interface ProductAIAsset {
  id: string;
  product_id: string;
  asset_type: "front" | "side" | "back" | "closeup" | "alternate" | "mask";
  url: string;
  alt_text: string | null;
}

export interface ProductVersion {
  id: string;
  product_id: string;
  version_number: number;
  snapshot_data: Record<string, unknown>;
  change_summary: string | null;
  created_at: string;
}

// ──────────────────────────────────────────────────────────────
// Hair Customization (Colour & Length) — per-product optional attributes
// ──────────────────────────────────────────────────────────────

/** Public option shape — deliberately omits prompt_fragment. */
export interface CustomizationOption {
  id: string;
  label: string;
  swatch_hex: string | null;
  image_url: string | null;
}

/** Public attribute shape, with its attached options for one product. */
export interface CustomizationAttribute {
  key: string;
  label: string;
  ui_type: "swatch" | "chip" | "thumbnail";
  options: CustomizationOption[];
}

export interface ProductCustomizationResponse {
  attributes: CustomizationAttribute[];
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  short_description?: string | null;
  sku: string | null;
  price: number | null;
  selling_price?: number | null;
  /** Compare-at / struck-through price. In India this is the legal MRP. */
  mrp?: number | null;
  /**
   * ISO 4217 code the price fields are denominated in. Optional so rows read
   * before the currency column existed still typecheck; formatMoney() defaults
   * to INR, which is what every pre-existing row is.
   */
  currency?: string | null;
  discount_percentage?: number | null;
  image_url: string;
  shop_url?: string | null;
  gender?: "women" | "men" | "unisex" | "kids";
  brand?: string | null;
  status?: "draft" | "published" | "archived";
  hair_type?: string | null;
  hair_length?: string | null;
  hair_density?: string | null;
  hair_color?: string | null;
  base_material?: string | null;
  installation_type?: string | null;
  recommended_for?: string | null;
  is_featured?: boolean;
  is_new_arrival?: boolean;
  is_best_seller?: boolean;
  is_trending?: boolean;
  prompt_override?: string | null;
  customization_enabled?: boolean;
  is_active: boolean;
  display_order: number;
  category?: Category;
  collections?: Collection[];
  ai_assets?: ProductAIAsset[];
}

// ──────────────────────────────────────────────────────────────
// Generation API response types
// ──────────────────────────────────────────────────────────────

export interface GenerateResponse {
  imageUrl: string;
  mimeType: string;
}

export interface GenerateError {
  error: string;
}

export interface GateResponse {
  gate: "login" | "agent";
  message: string;
  stage: 1 | 3;
}

export type GenerateApiResponse = GenerateResponse | GateResponse | GenerateError;

export function isGenerateError(result: GenerateApiResponse): result is GenerateError {
  return "error" in result;
}

export function isGateResponse(result: GenerateApiResponse): result is GateResponse {
  return "gate" in result;
}

// ──────────────────────────────────────────────────────────────
// AI Stylist — face scan → ranked style shortlist (POST /api/suggest)
// ──────────────────────────────────────────────────────────────

/**
 * What the vision model observed about the customer. Every field is free text
 * written by the model and rendered verbatim, so treat each as optional — a
 * blank one is simply not shown.
 */
export interface FaceAnalysis {
  faceShape: string;
  hairType: string;
  skinTone: string;
  summary: string;
}

export interface SuggestedMatch {
  /** 1-based, best first. */
  rank: number;
  /** Model's own 0-100 confidence. Not displayed today; kept for analytics. */
  matchScore: number;
  /** One-sentence, second-person rationale shown under the product name. */
  reason: string;
  product: Product;
}

export interface SuggestResponse {
  analysis: FaceAnalysis;
  matches: SuggestedMatch[];
}

/** 200 response when the model couldn't find a face to work from. */
export interface SuggestNoFaceResponse {
  noFace: true;
  message: string;
}

export type SuggestApiResponse = SuggestResponse | SuggestNoFaceResponse | GenerateError;

export function isSuggestNoFace(result: SuggestApiResponse): result is SuggestNoFaceResponse {
  return "noFace" in result;
}

// ──────────────────────────────────────────────────────────────
// Funnel / session types (context.md §2)
// ──────────────────────────────────────────────────────────────

export type FunnelStage = 0 | 1 | 2 | 3;

export interface SessionStatus {
  sessionId: string;
  sessionToken: string;
  userId: string | null;
  stage: FunnelStage;
  creditsRemaining: number;
  creditsUsed: number;
  loginGateMessage: string;
  agentGateMessage: string;
}

// ──────────────────────────────────────────────────────────────
// Home trial offer (GET /api/home-trial)
// ──────────────────────────────────────────────────────────────

// Re-exported so lib/home-trial.ts can take its whole surface from one module.
export type { Attribution } from "@/lib/attribution";

export type HomeTrialAudience = "all" | "women" | "men";

/**
 * The result-screen home trial offer, as served to the browser.
 *
 * Both creatives are sent and the client picks by catalogue gender, rather
 * than the server resolving one: the config is fetched as soon as the
 * customer starts the flow, but gender isn't chosen until the style step, so
 * a server-resolved image would race the choice and could ship the wrong
 * artwork. `imageMen` has already fallen back to `imageWomen` if unset.
 */
export interface HomeTrialConfig {
  enabled: boolean;
  popupEnabled: boolean;
  url: string;
  imageWomen: string;
  imageMen: string;
  ctaLabel: string;
  subtext: string;
  /** Short pill above the CTA on the inline card. Empty hides it. */
  badge: string;
  audience: HomeTrialAudience;
  minTryons: number;
  delayMs: number;
  /** Cap the popup at one impression per browser session. */
  oncePerSession: boolean;
  /** Stop showing the popup once she has tapped through to book. */
  stopAfterBooking: boolean;
}

/** A HomeTrialConfig resolved against one customer — null when they aren't in the audience. */
export interface HomeTrialOffer {
  url: string;
  imageUrl: string;
  ctaLabel: string;
  subtext: string;
  badge: string;
}

/** Where a home trial click came from. Recorded as `utm_medium` and on the analytics event. */
export type HomeTrialSource = "result_popup" | "result_card";

// ──────────────────────────────────────────────────────────────
// Validation constants
// ──────────────────────────────────────────────────────────────

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AcceptedMimeType = (typeof ACCEPTED_IMAGE_TYPES)[number];

// What a customer is allowed to *pick*. It is not what gets uploaded — the
// browser re-encodes anything large down to UPLOAD_TARGET_BYTES first (see
// lib/image.ts), so this only has to be generous enough to cover a modern
// phone's full-resolution photo.
export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
