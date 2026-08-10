import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { getAdminContext } from "@/lib/admin-auth";
import { vaultNavPathFor } from "@/lib/vault";

// Defense-in-depth beyond proxy.ts's optimistic check: proxy only verifies a
// Supabase session exists, not that it belongs to an active admin_users row.
// This catches a valid-but-unlinked or suspended account. Note this check
// does not re-run on client-side transitions between sibling /admin/* pages
// (Next.js layouts persist across those) — the authoritative check per
// request still lives in lib/admin-auth.ts's requireAdmin(), called by every
// admin Route Handler.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminContext();
  if (!admin) {
    redirect("/admin/login");
  }

  // Below lg the sidebar collapses into a sticky top bar + drawer, so the
  // shell only becomes a row at lg. min-w-0 keeps wide children (tables,
  // horizontal scrollers) from stretching the flex row past the viewport.
  return (
    <div className="admin-ui min-h-screen bg-[#060606] text-white lg:flex">
      {/* vaultPath is null for everyone but the vault owner, so the secret
          path is never serialised into anyone else's page. */}
      <AdminSidebar admin={admin} vaultPath={vaultNavPathFor(admin)} />
      <main className="flex-1 min-w-0 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-safe">
        {children}
      </main>
    </div>
  );
}
