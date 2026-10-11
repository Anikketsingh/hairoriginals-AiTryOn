/**
 * GET / POST / PATCH /api/admin/kiosks
 *
 * Manage the in-store video standees (`kiosks` table). super_admin-only.
 *
 *   GET   — list kiosks with online status and per-kiosk activity
 *   POST  — create a kiosk: { name, location? } → also returns its first
 *           enrollment link, so a new standee can be set up in one step
 *   PATCH — update a kiosk: { id, name?, location?, isActive?, config?, revoke? }
 *           `revoke: true` clears the device secret; the standee drops to the
 *           "not registered" screen until it is enrolled again.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { parseJsonBody } from "@/lib/validate";
import { GEMINI_MODELS } from "@/lib/gemini-models";
import { REPORTING_TIMEZONE, startOfDayIso } from "@/lib/date-range";
import { KIOSK_MEDIA_BUCKET, resolveKioskConfig } from "@/lib/kiosk-auth";
import { issueEnrollCode } from "./enroll-code";

/** A standee heartbeats every 60s; three missed beats reads as offline. */
const ONLINE_WINDOW_MS = 3 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const configSchema = z
  .object({
    triesPerVisitor: z.number().int().min(1).max(50),
    dailyGenerationCap: z.number().int().min(1).max(10_000),
    idleTimeoutSeconds: z.number().int().min(20).max(900),
    downloadLinkTtlHours: z.number().int().min(1).max(24 * 90),
  })
  .partial();

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  location: z.string().trim().max(160).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  location: z.string().trim().max(160).nullable().optional(),
  isActive: z.boolean().optional(),
  config: configSchema.optional(),
  /** Public URL from /api/admin/kiosks/[id]/video after upload, or null to remove. */
  attractVideoUrl: z.string().url().nullable().optional(),
  revoke: z.literal(true).optional(),
});

const MEDIA_PATH_MARKER = `/object/public/${KIOSK_MEDIA_BUCKET}/`;

/** Object path inside the kiosk-media bucket for one of its public URLs, or null if it isn't one. */
function mediaObjectPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf(MEDIA_PATH_MARKER);
  return i === -1 ? null : decodeURIComponent(url.slice(i + MEDIA_PATH_MARKER.length).split("?")[0]);
}

async function count(
  query: PromiseLike<{ count: number | null }>
): Promise<number> {
  const { count: n } = await query;
  return n ?? 0;
}

async function kioskStats(kioskId: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: REPORTING_TIMEZONE }).format(new Date());
  const startToday = startOfDayIso(today) ?? new Date(Date.now() - DAY_MS).toISOString();
  const since7d = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const since30d = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const gens = () =>
    supabaseAdmin.from("generations").select("id", { count: "exact", head: true }).eq("kiosk_id", kioskId);

  // Per-model head counts rather than fetching rows: exact at any volume,
  // where a row fetch would be truncated by PostgREST's max-rows cap.
  const events = (event: string) =>
    count(
      supabaseAdmin
        .from("kiosk_lead_events")
        .select("id", { count: "exact", head: true })
        .eq("kiosk_id", kioskId)
        .eq("event", event)
        .gte("created_at", since30d)
    );
  const leads30d = () =>
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("kiosk_id", kioskId)
      .gte("created_at", since30d);

  // Phone-handoff funnel over the last 30 days: QR shown → scanned → number → home trial.
  const [today_, last7d, qrShown, qrScanned, numbers, homeTrial, ...perModel] = await Promise.all([
    count(gens().gte("created_at", startToday)),
    count(gens().gte("created_at", since7d)),
    events("qr_shown"),
    events("qr_scanned"),
    count(leads30d().not("phone", "is", null)),
    count(leads30d().not("home_trial_interest_at", "is", null)),
    ...GEMINI_MODELS.map((m) =>
      count(gens().eq("status", "completed").eq("model", m.id).gte("created_at", since30d))
    ),
  ]);

  const cost30dUsd = GEMINI_MODELS.reduce((sum, m, i) => sum + perModel[i] * m.pricePerImageUsd, 0);

  return {
    generationsToday: today_,
    generations7d: last7d,
    qrShown,
    qrScanned,
    numbers,
    homeTrial,
    cost30dUsd: Number(cost30dUsd.toFixed(2)),
  };
}

export async function GET() {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { data, error } = await supabaseAdmin
      .from("kiosks")
      .select("id, name, location, is_active, config, last_seen_at, app_version, enrolled_at, token_hash, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch kiosks." }, { status: 500 });
    }

    const kiosks = await Promise.all(
      (data ?? []).map(async (k) => {
        const lastSeen = k.last_seen_at ? new Date(k.last_seen_at as string).getTime() : 0;
        return {
          id: k.id as string,
          name: k.name as string,
          location: (k.location as string | null) ?? null,
          isActive: k.is_active as boolean,
          enrolled: k.token_hash !== null,
          online: k.token_hash !== null && Date.now() - lastSeen < ONLINE_WINDOW_MS,
          lastSeenAt: (k.last_seen_at as string | null) ?? null,
          appVersion: (k.app_version as string | null) ?? null,
          enrolledAt: (k.enrolled_at as string | null) ?? null,
          config: resolveKioskConfig(k.config),
          stats: await kioskStats(k.id as string),
        };
      })
    );

    return NextResponse.json({ kiosks });
  } catch (err) {
    console.error("[/api/admin/kiosks GET] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, createSchema);
    if (parsed.error) return parsed.error;

    const { data: kiosk, error } = await supabaseAdmin
      .from("kiosks")
      .insert({
        name: parsed.data.name,
        location: parsed.data.location || null,
        created_by: admin.id,
      })
      .select("id")
      .single();

    if (error || !kiosk) {
      console.error("[/api/admin/kiosks POST] Insert error:", error?.message);
      return NextResponse.json({ error: "Failed to create kiosk." }, { status: 500 });
    }

    const enrollment = await issueEnrollCode(kiosk.id as string);
    if (!enrollment) {
      return NextResponse.json({ error: "Kiosk created, but the enrollment code failed. Generate one from the list." }, { status: 500 });
    }

    return NextResponse.json({ id: kiosk.id, enrollment }, { status: 201 });
  } catch (err) {
    console.error("[/api/admin/kiosks POST] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(["super_admin"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const parsed = await parseJsonBody(request, updateSchema);
    if (parsed.error) return parsed.error;
    const { id, name, location, isActive, config, attractVideoUrl, revoke } = parsed.data;

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (location !== undefined) update.location = location || null;
    if (isActive !== undefined) update.is_active = isActive;
    if (revoke) update.token_hash = null;

    // Only ever point a standee at a video uploaded for that standee — never
    // an arbitrary URL, since the standee's browser plays whatever is here.
    const newVideoPath = mediaObjectPath(attractVideoUrl);
    if (attractVideoUrl && !newVideoPath?.startsWith(`${id}/`)) {
      return NextResponse.json({ error: "Upload the video through Admin → Kiosks." }, { status: 400 });
    }

    let previousVideoPath: string | null = null;
    if (config || attractVideoUrl !== undefined) {
      const { data: current } = await supabaseAdmin.from("kiosks").select("config").eq("id", id).maybeSingle();
      if (!current) return NextResponse.json({ error: "Kiosk not found." }, { status: 404 });
      const resolved = resolveKioskConfig(current.config);
      update.config = {
        ...resolved,
        ...(config ?? {}),
        ...(attractVideoUrl !== undefined ? { attractVideoUrl } : {}),
      };
      if (attractVideoUrl !== undefined) {
        const oldPath = mediaObjectPath(resolved.attractVideoUrl);
        if (oldPath && oldPath !== newVideoPath) previousVideoPath = oldPath;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("kiosks").update(update).eq("id", id);
    if (error) {
      console.error("[/api/admin/kiosks PATCH] Update error:", error.message);
      return NextResponse.json({ error: "Failed to update kiosk." }, { status: 500 });
    }

    // Best-effort cleanup of the replaced video; a leftover file only costs storage.
    if (previousVideoPath) {
      const { error: removeError } = await supabaseAdmin.storage.from(KIOSK_MEDIA_BUCKET).remove([previousVideoPath]);
      if (removeError) console.error("[/api/admin/kiosks PATCH] Old video cleanup failed:", removeError.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/admin/kiosks PATCH] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
