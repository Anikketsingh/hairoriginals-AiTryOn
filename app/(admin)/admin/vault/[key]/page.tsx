/**
 * /admin/vault/[key] — the image vault.
 *
 * The `[key]` segment is a shared secret (VAULT_PATH_KEY), not a resource id:
 * anything that isn't an exact match renders the normal 404, so the route is
 * indistinguishable from a page that was never built. That's the third of the
 * four gates described in lib/vault.ts; the password prompt inside
 * VaultGallery is the fourth.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canOpenVault } from "@/lib/vault";
import VaultGallery from "@/components/admin/VaultGallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vault",
  // Belt and braces — the page 404s for anyone unauthorized, but nothing here
  // should ever end up in an index.
  robots: { index: false, follow: false },
};

export default async function VaultPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  if (!(await canOpenVault(key))) notFound();

  return <VaultGallery pathKey={key} />;
}
