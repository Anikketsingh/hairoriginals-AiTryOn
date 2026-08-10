/**
 * lib/vault-export.ts
 *
 * Browser-side bulk export for the image vault. Runs in the page, not on the
 * server — import it only from client components.
 *
 * Why the browser: the library is thousands of images and several gigabytes.
 * Streaming that through a Route Handler puts the *user's* download speed
 * inside the function's `maxDuration`, so a slow connection truncates the
 * archive no matter how the batches are sized. Supabase Storage serves signed
 * URLs with `Access-Control-Allow-Origin: *`, so the page can fetch every
 * object directly and frame the ZIP itself: no function in the byte path, no
 * time limit, and the whole library lands as one file.
 *
 * Memory stays flat because the archive is piped straight to disk through the
 * File System Access API as it's built — one image is resident at a time. That
 * API is Chromium-only, so callers must check `supportsDirectExport()` first
 * and fall back to the server's batched ZIP route where it's missing.
 */

import { createZipStream, type ZipEntry } from "@/lib/zip-stream";

/** Images fetched in parallel, ahead of the ZIP writer. */
const PREFETCH = 6;
/** Generations per gallery request while walking the library. */
const PAGE_GENERATIONS = 120;

interface GalleryItem {
  id: string;
  generationId: string;
  kind: "source" | "result";
  archiveName: string;
  createdAt: string;
  url: string;
}

interface GalleryPage {
  items: GalleryItem[];
  nextOffset: number | null;
}

/**
 * Minimal shape of the File System Access API — TypeScript's DOM lib doesn't
 * declare it, and we only touch these two calls.
 */
interface SaveFilePickerWindow {
  showSaveFilePicker(options?: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>;
}

export function supportsDirectExport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as SaveFilePickerWindow).showSaveFilePicker === "function"
  );
}

/** Thrown-and-swallowed marker for the user dismissing the save dialog. */
export class ExportCancelled extends Error {}

export interface VaultExportProgress {
  written: number;
  skipped: number;
}

/**
 * Fetches `items` through `load` with `concurrency` requests in flight, still
 * yielding in order. Latency, not bandwidth, is what makes a naive one-at-a-
 * time loop slow over thousands of small objects.
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

export interface VaultExportOptions {
  /** Builds a URL for a vault API route, e.g. `gallery?kind=all`. */
  api: (route: string) => string;
  kind: "all" | "source" | "result";
  onProgress?: (progress: VaultExportProgress) => void;
  signal?: AbortSignal;
}

/**
 * Streams every image of `kind` into a single ZIP the user picks a location
 * for. Resolves once the archive is fully written.
 *
 * Signed URLs are minted a page at a time as the walk proceeds rather than all
 * up front, so an export that runs for an hour never reaches an object whose
 * URL expired before the writer got to it.
 */
export async function exportVaultToFile(
  options: VaultExportOptions
): Promise<VaultExportProgress> {
  const { api, kind, onProgress, signal } = options;

  // Must be the first thing after the click: the picker needs the user
  // gesture, which any prior `await` would spend.
  let writable: WritableStream<Uint8Array>;
  try {
    const handle = await (window as unknown as SaveFilePickerWindow).showSaveFilePicker({
      suggestedName: `hairoriginals-tryon-${kind}-${new Date().toISOString().slice(0, 10)}.zip`,
      types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
    });
    writable = await handle.createWritable();
  } catch {
    // AbortError from dismissing the dialog, or no permission — either way
    // there's nothing to write to.
    throw new ExportCancelled();
  }

  const progress: VaultExportProgress = { written: 0, skipped: 0 };
  const manifest = ["filename,generation_id,kind,created_at"];

  async function* entries(): AsyncGenerator<ZipEntry> {
    let offset: number | null = 0;

    while (offset !== null) {
      if (signal?.aborted) return;

      const response = await fetch(
        api(`gallery?kind=${kind}&offset=${offset}&limit=${PAGE_GENERATIONS}`),
        { signal }
      );
      if (!response.ok) {
        throw new Error(`Could not list images (HTTP ${response.status}).`);
      }
      const page = (await response.json()) as GalleryPage;

      const loaded = ordered(page.items, PREFETCH, async (item) => {
        try {
          const image = await fetch(item.url, { signal });
          if (!image.ok) throw new Error(`HTTP ${image.status}`);
          return { item, data: new Uint8Array(await image.arrayBuffer()) };
        } catch (err) {
          // One unreadable object must not abandon an export that may already
          // be gigabytes in. It's simply absent, and the manifest omits it.
          if (signal?.aborted) throw err;
          console.error(`[vault] skipped ${item.archiveName}:`, err);
          return null;
        }
      });

      for await (const result of loaded) {
        if (signal?.aborted) return;
        if (!result) {
          progress.skipped += 1;
          onProgress?.({ ...progress });
          continue;
        }

        manifest.push(
          [
            result.item.archiveName,
            result.item.generationId,
            result.item.kind,
            result.item.createdAt,
          ]
            .map((cell) => `"${cell.replace(/"/g, '""')}"`)
            .join(",")
        );

        yield {
          name: result.item.archiveName,
          data: result.data,
          date: new Date(result.item.createdAt),
        };

        progress.written += 1;
        onProgress?.({ ...progress });
      }

      offset = page.nextOffset;
    }

    // Last, because it can only be complete once every image has been tried.
    yield {
      name: "manifest.csv",
      data: new TextEncoder().encode(`${manifest.join("\n")}\n`),
    };
  }

  try {
    await createZipStream(entries()).pipeTo(writable, { signal });
  } catch (err) {
    // pipeTo already aborted the file stream; surface why unless it was us.
    if (signal?.aborted) throw new ExportCancelled();
    throw err;
  }

  return progress;
}
