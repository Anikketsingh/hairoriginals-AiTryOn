/**
 * GET /api/crm-media/[id]/[kind]
 *
 * Stable, non-expiring image URL we hand the DC CRM (and its agents). Digicuro
 * renders lead images from the URLs we send but does not re-host them, so raw
 * ~30-day signed Supabase URLs would go dead. This endpoint is a permanent
 * indirection: it looks up the generation's private storage path and 302s to a
 * freshly-signed, short-lived URL on each request. The buckets stay private;
 * only the (unguessable UUID) generation id is needed to view.
 *
 * `kind` is `result` (the generated look) or `source` (the customer's photo).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";

export const dynamic = "force-dynamic";

const KIND_CONFIG = {
  result: { column: "result_image_path", bucket: "results" },
  source: { column: "source_image_path", bucket: "sources" },
} as const;

/** Short-lived signing for the redirect target; the proxy URL itself is stable. */
const SIGNED_URL_TTL_SECONDS = 5 * 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const { id, kind } = await params;
  const config = KIND_CONFIG[kind as keyof typeof KIND_CONFIG];
  if (!config) {
    return NextResponse.json({ error: "Invalid media kind." }, { status: 404 });
  }

  const { data: gen } = await supabaseAdmin
    .from("generations")
    .select(config.column)
    .eq("id", id)
    .maybeSingle();

  const path = gen ? ((gen as Record<string, unknown>)[config.column] as string | null) : null;
  if (!path) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: signed } = await supabaseAdmin.storage
    .from(config.bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  const url = toPublicStorageUrl(signed?.signedUrl ?? null);
  if (!url) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Don't cache the redirect — its target is a short-lived signed URL.
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
