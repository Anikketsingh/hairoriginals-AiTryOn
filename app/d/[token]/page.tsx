/**
 * /d/[token] — the page behind the QR code on the kiosk result screen.
 *
 * Opened on the visitor's own phone, so this is a normal mobile page, not a
 * kiosk screen. It resolves the token minted by /api/kiosk/download-link to
 * a short-lived signed URL for the result image, with a download variant.
 * Expired or unknown tokens get a friendly dead end rather than a 404.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";

export const metadata: Metadata = {
  title: "Your HairOriginals look",
  robots: { index: false, follow: false },
};

// Only needs to outlive this page view and the tap on "Download".
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type Resolved =
  | { ok: true; viewUrl: string; downloadUrl: string }
  | { ok: false; reason: "expired" | "missing" };

async function resolveDownload(token: string): Promise<Resolved> {
  const { data: link } = await supabaseAdmin
    .from("result_downloads")
    .select("token, expires_at, download_count, first_opened_at, generations(result_image_path)")
    .eq("token", token)
    .maybeSingle();

  const path = (link?.generations as { result_image_path?: string | null } | null)?.result_image_path;
  if (!link || !path) return { ok: false, reason: "missing" };
  if (new Date(link.expires_at as string).getTime() < Date.now()) return { ok: false, reason: "expired" };

  const bucket = supabaseAdmin.storage.from("results");
  const [view, download] = await Promise.all([
    bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS),
    bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: "hairoriginals-look.png" }),
  ]);
  if (!view.data?.signedUrl || !download.data?.signedUrl) return { ok: false, reason: "missing" };

  // Best-effort open counter for admin reporting; never blocks the page.
  await supabaseAdmin
    .from("result_downloads")
    .update({
      download_count: ((link.download_count as number) ?? 0) + 1,
      first_opened_at: (link.first_opened_at as string | null) ?? new Date().toISOString(),
    })
    .eq("token", token);

  return {
    ok: true,
    viewUrl: toPublicStorageUrl(view.data.signedUrl),
    downloadUrl: toPublicStorageUrl(download.data.signedUrl),
  };
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
          <h1 className="text-xl font-semibold text-center">Here&apos;s your new look</h1>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not optimisable */}
          <img
            src={result.viewUrl}
            alt="Your AI try-on result"
            className="w-full max-w-md rounded-2xl shadow-lg bg-surface"
          />
          <div className="w-full max-w-md flex flex-col gap-3">
            <a
              href={result.downloadUrl}
              className="w-full rounded-xl bg-brand text-white text-center font-medium py-3"
            >
              Download photo
            </a>
            {storeUrl && (
              <a
                href={storeUrl}
                className="w-full rounded-xl border border-line-strong text-center font-medium py-3"
              >
                Shop this style
              </a>
            )}
          </div>
          <p className="text-xs text-ink-faint text-center">
            On iPhone, press and hold the photo and choose &ldquo;Save to Photos&rdquo;.
          </p>
        </>
      ) : (
        <div className="max-w-md text-center flex flex-col gap-2 mt-12">
          <h1 className="text-xl font-semibold">
            {result.reason === "expired" ? "This link has expired" : "We couldn't find this look"}
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
