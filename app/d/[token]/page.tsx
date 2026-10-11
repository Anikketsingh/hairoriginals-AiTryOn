/**
 * /d/[token] — a standee visitor's photos, opened on their own phone from the
 * link we SMS (or they share on WhatsApp) from the phone page /s/[token].
 *
 * A token covers either one look (generation_id) or a whole visit
 * (session_id → every completed look from it). Each look gets a view URL and
 * a download URL (signed, short-lived). Expired or unknown tokens get a
 * friendly dead end rather than a 404.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";

export const metadata: Metadata = {
  title: "Your HairOriginals looks",
  robots: { index: false, follow: false },
};

// Only needs to outlive this page view and the tap on "Download".
const SIGNED_URL_TTL_SECONDS = 60 * 60;

interface LookLinks {
  id: string;
  styleName: string | null;
  viewUrl: string;
  downloadUrl: string;
}

type Resolved = { ok: true; looks: LookLinks[] } | { ok: false; reason: "expired" | "missing" };

async function resolveDownload(token: string): Promise<Resolved> {
  const { data: link } = await supabaseAdmin
    .from("result_downloads")
    .select("token, generation_id, session_id, expires_at, download_count, first_opened_at")
    .eq("token", token)
    .maybeSingle();

  if (!link) return { ok: false, reason: "missing" };
  if (new Date(link.expires_at as string).getTime() < Date.now()) return { ok: false, reason: "expired" };

  let query = supabaseAdmin
    .from("generations")
    .select("id, result_image_path, products(name)")
    .eq("status", "completed")
    .not("result_image_path", "is", null)
    .order("created_at", { ascending: false });
  query = link.session_id
    ? query.eq("session_id", link.session_id as string)
    : query.eq("id", link.generation_id as string);
  const { data: gens } = await query;
  if (!gens || gens.length === 0) return { ok: false, reason: "missing" };

  const bucket = supabaseAdmin.storage.from("results");
  const looks = await Promise.all(
    gens.map(async (g, i) => {
      const path = g.result_image_path as string;
      const [view, download] = await Promise.all([
        bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS),
        bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: `hairoriginals-look-${i + 1}.png` }),
      ]);
      if (!view.data?.signedUrl || !download.data?.signedUrl) return null;
      return {
        id: g.id as string,
        styleName: (g.products as { name?: string } | null)?.name ?? null,
        viewUrl: toPublicStorageUrl(view.data.signedUrl),
        downloadUrl: toPublicStorageUrl(download.data.signedUrl),
      };
    })
  );
  const ready = looks.filter((l): l is LookLinks => l !== null);
  if (ready.length === 0) return { ok: false, reason: "missing" };

  // Best-effort open counter for admin reporting; never blocks the page.
  await supabaseAdmin
    .from("result_downloads")
    .update({
      download_count: ((link.download_count as number) ?? 0) + 1,
      first_opened_at: (link.first_opened_at as string | null) ?? new Date().toISOString(),
    })
    .eq("token", token);

  return { ok: true, looks: ready };
}

export default async function DownloadPage(props: PageProps<"/d/[token]">) {
  const { token } = await props.params;
  const result = await resolveDownload(token);
  const storeUrl = process.env.NEXT_PUBLIC_STORE_URL;

  return (
    <main className="min-h-dvh px-4 py-8 flex flex-col items-center gap-6 pt-safe pb-safe">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-wordmark.png" alt="HairOriginals" className="h-8 w-auto" />

      {result.ok ? (
        <>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold tracking-tight">
              {result.looks.length > 1 ? `Your ${result.looks.length} new looks` : "Your new look"}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">Tap Download under each photo to save it.</p>
          </div>

          <div className="w-full max-w-md flex flex-col gap-6">
            {result.looks.map((look) => (
              <figure key={look.id} className="flex flex-col gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not optimisable */}
                <img
                  src={look.viewUrl}
                  alt={look.styleName ? `You with ${look.styleName}` : "Your AI try-on result"}
                  className="w-full rounded-2xl shadow-[var(--shadow-pop)] bg-surface"
                />
                <div className="flex items-center justify-between gap-3">
                  <figcaption className="text-sm font-semibold text-ink truncate">{look.styleName ?? "Your look"}</figcaption>
                  <a
                    href={look.downloadUrl}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-grad-1 via-grad-2 to-grad-3 px-5 py-2.5 text-sm font-bold text-white shadow-[var(--shadow-brand)]"
                  >
                    <Download className="h-4 w-4" /> Download
                  </a>
                </div>
              </figure>
            ))}
          </div>

          {storeUrl && (
            <a
              href={storeUrl}
              className="w-full max-w-md rounded-xl border border-line-strong bg-surface text-center font-semibold py-3"
            >
              Shop these styles
            </a>
          )}
          <p className="text-xs text-ink-faint text-center">
            On iPhone, you can also press and hold a photo and choose &ldquo;Save to Photos&rdquo;.
          </p>
        </>
      ) : (
        <div className="max-w-md text-center flex flex-col gap-2 mt-12">
          <h1 className="text-xl font-semibold">
            {result.reason === "expired" ? "This link has expired" : "We couldn't find these looks"}
          </h1>
          <p className="text-ink-soft">
            Visit a HairOriginals try-on kiosk to create a new look, or try it online.
          </p>
          <Link href="/" className="mt-4 rounded-xl bg-brand text-white font-medium py-3">
            Try on online
          </Link>
        </div>
      )}
    </main>
  );
}
