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
  mrp?: number | null;
  discount_percentage?: number | null;
  image_url: string;
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
  imageBase64: string;
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
// Validation constants
// ──────────────────────────────────────────────────────────────

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AcceptedMimeType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
