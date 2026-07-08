import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { getAdminContext } from "@/lib/admin-auth";

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

  return (
    <div className="min-h-screen flex bg-[#060606] text-white">
      <AdminSidebar admin={admin} />
      <div className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  );
}
