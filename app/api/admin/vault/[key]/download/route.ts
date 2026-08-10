/**
 * GET /api/admin/vault/[key]/download
 *
 * Streams a batch of the vault as a ZIP: every customer photo and generated
 * look in the range, plus a manifest.csv pairing each archived filename back
 * to its generation. Owner-only and password-gated — see lib/vault.ts.
 *
 * Query params:
 *   kind   all | source | result   (default all)
 *   offset generation offset       (default 0)
 *   limit  generations per archive (default BATCH_GENERATIONS, max 200)
 *
 * Why batches rather than one archive of everything: this runs on a serverless
 * function with a wall-clock ceiling (`maxDuration`), and an unbounded library
 * would blow through it mid-stream, leaving a truncated ZIP with no way to
 * resume. A batch sized to finish well inside the budget always produces a
 * complete, openable archive; the client walks `offset` to cover the library
 * and presents it as a single click.
 *
 * Nothing is buffered: images are pulled from Storage a few at a time and
 * framed into the response as they arrive, so memory stays flat regardless of
 * how large the batch is.
 */

export const runtime = "nodejs"; // node:crypto, via lib/vault.ts
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireVaultAccess, VAULT_COOKIE } from "@/lib/vault";
import {
  fetchVaultImages,
  parseKind,
  signVaultImages,
  VAULT_EXPORT_BATCH,
  vaultArchiveName,
  type VaultImage,
} from "@/lib/vault-images";
import { createZipStream, type ZipEntry } from "@/lib/zip-stream";

/**
 * Ceiling on `limit`. The default (VAULT_EXPORT_BATCH) is sized to finish
 * comfortably inside `maxDuration` on a slow connection; raising it past this
 * risks a truncated archive with no way to resume.
 */
const MAX_BATCH_GENERATIONS = 200;

/** Must outlast the whole transfer, not just the request that mints it. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Images fetched from Storage in parallel, ahead of the ZIP writer. */
const PREFETCH = 6;

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Fetches `items` through `load`, keeping `concurrency` requests in flight
 * while still yielding strictly in order — the ZIP writer needs a
 * deterministic sequence, but waiting for each image before starting the next
 * would leave the archive limited by round-trip latency.
 */
async function* ordered<T, R>(
  items: T[],
  concurrency: number,
  load: (item: T) => Promise<R>
): AsyncGenerator<R> {
  const inFlight: Promise<R>[] = [];
  let next = 0;

  while (next < items.length && inFlight.length < concurrency) {
    inFlight.push(load(items[next++]));
  }
  while (inFlight.length > 0) {
    const result = await inFlight.shift()!;
    if (next < items.length) inFlight.push(load(items[next++]));
    yield result;
  }
}

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
    MAX_BATCH_GENERATIONS,
    Math.max(1, Number(searchParams.get("limit")) || VAULT_EXPORT_BATCH)
  );

  let images: VaultImage[];
  let urlById: Map<string, string>;
  try {
    ({ images } = await fetchVaultImages(kind, offset, limit));
    urlById = await signVaultImages(images, SIGNED_URL_TTL_SECONDS);
  } catch (err) {
    console.error("[vault] download listing failed:", err);
    return NextResponse.json({ error: "Failed to prepare download." }, { status: 500 });
  }

  const downloadable = images.filter((image) => urlById.has(image.id));

  // The listing is already in hand, so the manifest can lead the archive
  // rather than trail it — it's readable even if the transfer is interrupted.
  const manifest = [
    "filename,generation_id,kind,created_at",
    ...downloadable.map((image) =>
      [
        vaultArchiveName(image),
        image.generationId,
        image.kind,
        image.createdAt,
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\n");

  async function* entries(): AsyncGenerator<ZipEntry> {
    yield { name: "manifest.csv", data: new TextEncoder().encode(`${manifest}\n`) };

    const loaded = ordered(downloadable, PREFETCH, async (image) => {
      try {
        const response = await fetch(urlById.get(image.id)!);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { image, data: new Uint8Array(await response.arrayBuffer()) };
      } catch (err) {
        // One unreadable object must not abort an otherwise good export —
        // it's simply absent from the archive, and the manifest still lists
        // it so the gap is visible.
        console.error(`[vault] failed to fetch ${image.bucket}/${image.path}:`, err);
        return null;
      }
    });

    for await (const result of loaded) {
      if (!result) continue;
      yield {
        name: vaultArchiveName(result.image),
        data: result.data,
        date: new Date(result.image.createdAt),
      };
    }
  }

  const part = Math.floor(offset / limit) + 1;
  const filename = `hairoriginals-tryon-${kind}-part-${String(part).padStart(3, "0")}.zip`;

  return new Response(createZipStream(entries()), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      // The archive is framed as it streams, so its length isn't known up
      // front — tell proxies not to buffer waiting for one.
      "X-Accel-Buffering": "no",
    },
  });
}
