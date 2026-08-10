/**
 * lib/vault-images.ts
 *
 * The one definition of "every try-on image", shared by the vault gallery and
 * its bulk export (app/api/admin/vault/[key]/{gallery,download}). Keeping the
 * query in one place is what makes "Download all" actually match what the
 * gallery shows — the same failure mode lib/lead-filters.ts exists to prevent
 * for the CRM list and its Excel export.
 *
 * An "image" here is one side of one generation: the customer's captured photo
 * (`sources` bucket) or the look the model produced (`results` bucket). Both
 * buckets are private, so every URL handed out is freshly signed.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";

export const VAULT_KINDS = ["all", "source", "result"] as const;
export type VaultKindFilter = (typeof VAULT_KINDS)[number];
export type VaultImageKind = "source" | "result";

/**
 * Generations per archive on the *fallback* export path (the server-streamed
 * ZIP used by browsers without the File System Access API — see
 * lib/vault-export.ts for the primary one).
 *
 * Deliberately small. On that path the user's own download speed is spent
 * inside the function's `maxDuration`, so the ceiling isn't how fast we can
 * read Storage but how fast the archive reaches them: ~25 generations is ~50
 * images, which clears a 60s budget even on a slow connection. Lives here
 * rather than in the route because the browser has to agree on it to split the
 * library into the right number of parts.
 */
export const VAULT_EXPORT_BATCH = 25;

const KIND_CONFIG = {
  source: { column: "source_image_path", mimeColumn: "source_mime_type", bucket: "sources" },
  result: { column: "result_image_path", mimeColumn: "result_mime_type", bucket: "results" },
} as const;

export interface VaultImage {
  /** `<generationId>:<kind>` — unique, and a stable React key. */
  id: string;
  generationId: string;
  kind: VaultImageKind;
  bucket: string;
  path: string;
  mimeType: string | null;
  createdAt: string;
}

export function parseKind(value: string | null): VaultKindFilter {
  return VAULT_KINDS.includes(value as VaultKindFilter) ? (value as VaultKindFilter) : "all";
}

interface GenerationRow {
  id: string;
  created_at: string;
  source_image_path: string | null;
  source_mime_type: string | null;
  result_image_path: string | null;
  result_mime_type: string | null;
}

/**
 * PostgREST filter selecting generations that hold at least one image of the
 * requested kind. Rows whose upload failed (a null path) are excluded here so
 * neither caller has to special-case them.
 */
function kindFilter(kind: VaultKindFilter): string {
  if (kind === "all") {
    return "source_image_path.not.is.null,result_image_path.not.is.null";
  }
  return `${KIND_CONFIG[kind].column}.not.is.null`;
}

/**
 * One page of images, newest first.
 *
 * Paging is by *generation*, not by image, because a generation is the unit
 * that has a timestamp to sort on — a page therefore yields between `limit`
 * and `2 × limit` images when `kind` is "all". Callers advance by
 * `generationsReturned`, not by image count.
 */
export async function fetchVaultImages(
  kind: VaultKindFilter,
  offset: number,
  limit: number
): Promise<{ images: VaultImage[]; generationsReturned: number }> {
  const { data, error } = await supabaseAdmin
    .from("generations")
    .select(
      "id, created_at, source_image_path, source_mime_type, result_image_path, result_mime_type"
    )
    .or(kindFilter(kind))
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to list vault images: ${error.message}`);

  const rows = (data ?? []) as GenerationRow[];
  const images: VaultImage[] = [];

  for (const row of rows) {
    // Source first so a customer's own photo sits immediately before the look
    // it produced — the pairing survives even in the flat, uncategorised grid.
    for (const imageKind of ["source", "result"] as const) {
      if (kind !== "all" && kind !== imageKind) continue;
      const config = KIND_CONFIG[imageKind];
      const path = row[config.column];
      if (!path) continue;

      images.push({
        id: `${row.id}:${imageKind}`,
        generationId: row.id,
        kind: imageKind,
        bucket: config.bucket,
        path,
        mimeType: row[config.mimeColumn],
        createdAt: row.created_at,
      });
    }
  }

  return { images, generationsReturned: rows.length };
}

/** Totals for the header and for sizing the export's batches. */
export async function countVaultImages(kind: VaultKindFilter): Promise<{
  sources: number;
  results: number;
  images: number;
  generations: number;
}> {
  const countOf = async (filter: string): Promise<number> => {
    const { count, error } = await supabaseAdmin
      .from("generations")
      .select("id", { count: "exact", head: true })
      .or(filter);
    // Swallowing this would render an empty vault as a legitimate "0 images"
    // and quietly disable the export button, with nothing to explain why.
    if (error) throw new Error(`Failed to count vault images: ${error.message}`);
    return count ?? 0;
  };

  const [sources, results, generations] = await Promise.all([
    countOf(kindFilter("source")),
    countOf(kindFilter("result")),
    countOf(kindFilter(kind)),
  ]);

  const images =
    kind === "all" ? sources + results : kind === "source" ? sources : results;

  return { sources, results, images, generations };
}

/**
 * Signs a batch of images for browser display. Signing is per-bucket, so the
 * batch is split and stitched back together in the original order.
 */
export async function signVaultImages(
  images: VaultImage[],
  ttlSeconds: number
): Promise<Map<string, string>> {
  const urlById = new Map<string, string>();

  await Promise.all(
    (["sources", "results"] as const).map(async (bucket) => {
      const inBucket = images.filter((image) => image.bucket === bucket);
      if (inBucket.length === 0) return;

      const { data } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrls(
          inBucket.map((image) => image.path),
          ttlSeconds
        );

      const urlByPath = new Map<string, string>();
      data?.forEach((signed) => {
        if (signed.path && signed.signedUrl) urlByPath.set(signed.path, signed.signedUrl);
      });

      for (const image of inBucket) {
        const url = toPublicStorageUrl(urlByPath.get(image.path) ?? null);
        if (url) urlById.set(image.id, url);
      }
    })
  );

  return urlById;
}

/**
 * Name for this image inside the export archive. Timestamp-first so the flat
 * folder sorts chronologically in any file browser, and suffixed with the
 * generation id so source/result stay adjacent and no two entries collide.
 */
export function vaultArchiveName(image: VaultImage): string {
  const stamp = image.createdAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const extension =
    image.path.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    image.mimeType?.split("/")[1] ||
    "jpg";
  return `${stamp}_${image.generationId}_${image.kind}.${extension}`;
}
