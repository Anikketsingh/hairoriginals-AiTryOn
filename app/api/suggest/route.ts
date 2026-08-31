/**
 * POST /api/suggest — AI Stylist
 *
 * Takes the customer's photo, analyses their face and hair with a text-output
 * Gemini model, and ranks the catalog for them. The customer picks one of the
 * returned styles and the ordinary try-on flow takes over from there.
 *
 * This route is deliberately READ-ONLY AND NON-BILLING: it never writes to
 * `generations`, never touches `generation_credits`, and never calls
 * generateTryOn. It cannot break or bill the existing try-on path — if it
 * fails, the customer is simply left on the style grid to pick by hand.
 *
 * It does spend real Gemini money per call without a credit standing in the
 * way, so checkSuggestRateLimit is the only thing bounding that spend.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { getSessionByToken } from "@/lib/funnel";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";
import { getClientIp, checkSuggestRateLimit } from "@/lib/rate-limit";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { maintenanceGuard } from "@/lib/maintenance";
import {
  analyzeFaceForStyles,
  SUGGESTION_MODEL,
  SUGGEST_CANDIDATE_LIMIT,
  SUGGEST_MATCH_COUNT,
} from "@/lib/gemini-vision";
import type { SuggestCandidate } from "@/lib/prompt";
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from "@/lib/types";
import type { Product, SuggestedMatch } from "@/lib/types";
// TEMPORARY instrumentation — see lib/debug-timing.ts
import { createTimer } from "@/lib/debug-timing";

// Matches /api/generate. The vision call itself is capped at 20s (plus one
// retry) in lib/gemini-vision.ts, comfortably inside this.
export const maxDuration = 60;

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = MAX_FILE_SIZE_BYTES;
const ALLOWED_GENDERS = ["women", "men"] as const;

/**
 * Columns the sheet needs to render a product card, plus the descriptive
 * columns the model matches against. The `hair_*` / `base_material` /
 * `installation_type` / `recommended_for` fields are NOT returned by the
 * public /api/products — they exist for exactly this.
 */
const CANDIDATE_COLUMNS =
  "id, category_id, name, slug, description, short_description, sku, price, selling_price, mrp, currency, discount_percentage, image_url, shop_url, gender, brand, is_best_seller, is_active, display_order, customization_enabled, hair_type, hair_length, hair_density, hair_color, base_material, installation_type, recommended_for, categories(id, name, slug)";

type CandidateRow = Product & {
  hair_type: string | null;
  hair_length: string | null;
  hair_density: string | null;
  hair_color: string | null;
  base_material: string | null;
  installation_type: string | null;
  recommended_for: string | null;
  categories?: { id: string; name: string; slug: string } | null;
};

function toPromptCandidate(row: CandidateRow): SuggestCandidate {
  return {
    id: row.id,
    name: row.name,
    categoryName: row.categories?.name ?? null,
    shortDescription: row.short_description ?? null,
    hairType: row.hair_type,
    hairLength: row.hair_length,
    hairDensity: row.hair_density,
    hairColor: row.hair_color,
    baseMaterial: row.base_material,
    installationType: row.installation_type,
    recommendedFor: row.recommended_for,
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const t = createTimer("suggest:server"); // TEMPORARY
  let sessionId: string | null = null;
  let userId: string | null = null;

  try {
    const closed = await maintenanceGuard(request);
    if (closed) return closed;
    t.mark("maintenance-guard");

    // Kill switch. An env var rather than a `settings` row because
    // /api/admin/settings only UPDATEs existing keys — an unseeded key could
    // never be toggled from the admin UI anyway.
    if (process.env.AI_SUGGESTION_ENABLED === "false") {
      return NextResponse.json(
        { error: "Style suggestions are unavailable right now. Please pick a style below." },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    t.mark("parse-multipart");
    const personImage = formData.get("personImage") as File | null;
    const sessionToken = formData.get("sessionToken") as string | null;
    const genderRaw = formData.get("gender") as string | null;
    const gender = (ALLOWED_GENDERS as readonly string[]).includes(genderRaw ?? "")
      ? (genderRaw as (typeof ALLOWED_GENDERS)[number])
      : "women";

    // ── Validate the photo (same rules as /api/generate) ──────
    if (!personImage) {
      return NextResponse.json({ error: "A photo is required." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(personImage.type)) {
      return NextResponse.json(
        { error: `Invalid image type: ${personImage.type}. Use PNG, JPEG, or WEBP.` },
        { status: 400 }
      );
    }
    if (personImage.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Photo exceeds the ${MAX_FILE_SIZE_MB}MB limit. Please use a smaller image.` },
        { status: 400 }
      );
    }

    // ── Resolve session (analytics + rate-limit key only) ─────
    // No funnel gate and no consumeCredit: scanning is free. The generation
    // the customer triggers afterwards hits the existing gate unchanged.
    if (sessionToken) {
      const session = await getSessionByToken(sessionToken);
      if (session) {
        sessionId = session.id;
        userId = session.user_id;
      }
    }
    t.mark("session-lookup");

    const allowed = await checkSuggestRateLimit(sessionId ?? getClientIp(request));
    t.mark("rate-limit");
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many scans. Please wait a moment and try again." },
        { status: 429 }
      );
    }

    // ── Candidate catalog ─────────────────────────────────────
    // `gender.is.null` mirrors StyleStep's client-side filter, which treats a
    // product with no gender as visible to everyone.
    const { data: rows, error: productsError } = await supabaseAdmin
      .from("products")
      .select(CANDIDATE_COLUMNS)
      .eq("is_active", true)
      .or(`gender.eq.${gender},gender.eq.unisex,gender.is.null`)
      .order("display_order", { ascending: true })
      .limit(SUGGEST_CANDIDATE_LIMIT);

    t.mark("products-query");

    if (productsError) {
      console.error("[/api/suggest] Candidate fetch failed:", productsError.message);
      return NextResponse.json({ error: "Failed to load styles." }, { status: 500 });
    }

    const candidates = (rows ?? []) as unknown as CandidateRow[];
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "No styles are available to match against right now." },
        { status: 503 }
      );
    }

    // Deliberately not awaited. Measured at ~175ms of Supabase round-trip
    // sitting directly in front of the Gemini call, for a telemetry write
    // nothing downstream reads. `after()` keeps it alive past the response on
    // a serverless host (same reasoning as lib/jobs/runner.ts), and
    // recordAnalyticsEvent swallows its own errors, so this cannot reject.
    after(() => recordAnalyticsEvent("ai_suggest_started", { gender }, sessionId, userId));
    t.mark("analytics-started");

    // ── Analyse ───────────────────────────────────────────────
    const buffer = await personImage.arrayBuffer();
    const personBase64 = Buffer.from(buffer).toString("base64");
    t.mark(`base64(${Math.round(personImage.size / 1024)}KB)`);

    const result = await analyzeFaceForStyles(
      personBase64,
      personImage.type,
      candidates.map(toPromptCandidate)
    );
    t.mark("gemini-vision");

    if (!result.faceDetected) {
      await recordAnalyticsEvent(
        "ai_suggest_completed",
        { noFace: true, model: SUGGESTION_MODEL, durationMs: Date.now() - startTime },
        sessionId,
        userId
      );
      return NextResponse.json({
        noFace: true,
        message: "We couldn't see a face clearly. Try a brighter, front-facing photo.",
      });
    }

    // ── Map indices back to products ──────────────────────────
    // The model returns 1-based indices into the list it was shown. Anything
    // out of range or repeated is dropped rather than guessed at.
    const seen = new Set<number>();
    const matches: SuggestedMatch[] = [];
    for (const match of result.matches) {
      const idx = match.index - 1;
      if (idx < 0 || idx >= candidates.length || seen.has(idx)) continue;
      seen.add(idx);
      const row = candidates[idx];
      matches.push({
        rank: matches.length + 1,
        matchScore: match.matchScore,
        reason: match.reason,
        product: { ...row, image_url: toPublicStorageUrl(row.image_url) } as Product,
      });
      if (matches.length >= SUGGEST_MATCH_COUNT) break;
    }

    if (matches.length === 0) {
      // Every returned index was invalid. Falling back to a "popular styles"
      // list would mean inventing rationales the model never wrote, so say so
      // instead and let the customer browse.
      console.error(
        "[/api/suggest] No valid matches after index mapping:",
        JSON.stringify(result.matches)
      );
      await recordAnalyticsEvent(
        "ai_suggest_failed",
        { error: "no_valid_indices", model: SUGGESTION_MODEL },
        sessionId,
        userId
      );
      return NextResponse.json(
        { error: "We couldn't match a style to your photo. Please pick one below." },
        { status: 502 }
      );
    }

    // Also deferred — another ~185ms that was delaying the customer's result
    // for a write only the analytics table cares about.
    after(() =>
      recordAnalyticsEvent(
      "ai_suggest_completed",
      {
        durationMs: Date.now() - startTime,
        model: SUGGESTION_MODEL,
        faceShape: result.faceShape,
        hairType: result.hairType,
        candidateCount: candidates.length,
        rankedProductIds: matches.map((m) => m.product.id),
        // This model is token-billed, so Admin → Costs (which prices per
        // generated image) can't see it. These counts are the only record.
        usage: result.usage,
      },
      sessionId,
      userId
      )
    );
    t.mark("analytics-completed");
    t.log(`candidates=${candidates.length} matches=${matches.length}`);

    return NextResponse.json({
      analysis: {
        faceShape: result.faceShape,
        hairType: result.hairType,
        skinTone: result.skinTone,
        summary: result.summary,
      },
      matches,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    console.error("[/api/suggest] Unexpected error:", err);
    await recordAnalyticsEvent("ai_suggest_failed", { error: message }, sessionId, userId);
    return NextResponse.json(
      { error: "We couldn't finish the scan. Please pick a style below." },
      { status: 500 }
    );
  }
}
