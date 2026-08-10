/**
 * GET /api/admin/vault/[key]/gallery
 *
 * One page of the flat, uncategorised image wall: every customer photo and
 * every generated look across all users, newest first, with short-lived signed
 * URLs. Owner-only and password-gated — see lib/vault.ts.
 *
 * Query params:
 *   kind   all | source | result   (default all)
 *   offset generation offset       (default 0)
 *   limit  generations per page    (default 40, max 120)
 *
 * `offset`/`limit` count generations, not images: with kind=all one generation
 * can yield two images. Advance with the `nextOffset` returned here rather
 * than by counting items.
 */

export const runtime = "nodejs"; // node:crypto, via lib/vault.ts
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { refreshVaultUnlock, requireVaultAccess, VAULT_COOKIE } from "@/lib/vault";
import {
  countVaultImages,
  fetchVaultImages,
  parseKind,
  signVaultImages,
  VAULT_EXPORT_BATCH,
  vaultArchiveName,
} from "@/lib/vault-images";

/** Long enough to browse a page without re-signing, short enough to expire. */
const SIGNED_URL_TTL_SECONDS = 30 * 60;

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 120;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const admin = await requireVaultAccess(key, request.cookies.get(VAULT_COOKIE)?.value);
  if (admin instanceof NextResponse) return admin;

  const searchParams = request.nextUrl.searchParams;
  const kind = parseKind(searchParams.get("kind"));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT)
  );

  try {
    const { images, generationsReturned } = await fetchVaultImages(kind, offset, limit);
    const urlById = await signVaultImages(images, SIGNED_URL_TTL_SECONDS);

    // Totals drive the header and the export's batch count, and don't change
    // while paging — compute them on the first page only.
    const totals = offset === 0 ? await countVaultImages(kind) : null;

    // Refreshed on the way out: a full export walks this route for as long as
    // it runs, and that activity is what should hold the unlock open.
    return refreshVaultUnlock(
      NextResponse.json(
        {
          kind,
          totals,
          // The fallback export splits the library into batches of this size,
          // so the browser has to be told rather than guess.
          exportBatch: VAULT_EXPORT_BATCH,
          items: images
            // An image whose signing failed can't be rendered; drop it rather
            // than emit a broken tile.
            .filter((image) => urlById.has(image.id))
            .map((image) => ({
              id: image.id,
              generationId: image.generationId,
              kind: image.kind,
              createdAt: image.createdAt,
              // The browser-side export (lib/vault-export.ts) archives these
              // directly from Storage, so the name has to come from here —
              // otherwise the two export paths would disagree on filenames.
              archiveName: vaultArchiveName(image),
              url: urlById.get(image.id)!,
            })),
          // A short page means we've reached the end of the table.
          nextOffset: generationsReturned === limit ? offset + limit : null,
        },
        { headers: { "Cache-Control": "no-store" } }
      ),
      admin
    );
  } catch (err) {
    console.error("[vault] gallery failed:", err);
    return NextResponse.json({ error: "Failed to load images." }, { status: 500 });
  }
}
