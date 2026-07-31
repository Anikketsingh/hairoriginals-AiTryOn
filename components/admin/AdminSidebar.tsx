"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Package, Sliders, BookOpen, UserCheck, BarChart3, ExternalLink, Sparkles, Shield, Coins, LogOut, Users, Palette, Menu, X } from "lucide-react";
import type { AdminRole } from "@/lib/admin-auth";
import { supabaseAdminBrowserClient } from "@/lib/supabase/admin-browser-client";

const NAV_ITEMS: { label: string; href: string; icon: typeof LayoutDashboard; roles: AdminRole[] }[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, roles: ["super_admin", "content_manager", "sales_agent"] },
  { label: "Sales CRM & Leads", href: "/admin/crm", icon: UserCheck, roles: ["super_admin", "sales_agent"] },
  { label: "Products & Categories", href: "/admin/products", icon: Package, roles: ["super_admin", "content_manager"] },
  { label: "Hair Customization", href: "/admin/customization", icon: Palette, roles: ["super_admin", "content_manager"] },
  { label: "Funnel Analytics", href: "/admin/analytics", icon: BarChart3, roles: ["super_admin", "content_manager"] },
  { label: "AI Costs & Credits", href: "/admin/costs", icon: Coins, roles: ["super_admin"] },
  { label: "AI Configuration", href: "/admin/settings", icon: Sliders, roles: ["super_admin"] },
  { label: "Prompt Library", href: "/admin/prompts", icon: BookOpen, roles: ["super_admin"] },
  { label: "Team & Access", href: "/admin/team", icon: Users, roles: ["super_admin"] },
];

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  content_manager: "Content Manager",
  sales_agent: "Sales Agent",
};

interface AdminSidebarProps {
  admin: { name: string; role: AdminRole };
}

export default function AdminSidebar({ admin }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const visibleNavItems = NAV_ITEMS.filter((item) => item.roles.includes(admin.role));

  // Longest matching href wins, so a nested route (/admin/products/editor)
  // still highlights its parent item instead of falling back to "/admin".
  const activeItem = visibleNavItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  // While the drawer covers the screen, freeze the page behind it and let
  // Escape dismiss it.
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  const handleSignOut = async () => {
    await supabaseAdminBrowserClient.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  // Shared by the desktop rail and the mobile drawer.
  const panel = (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="flex flex-col gap-8">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/25">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-tight">HairOriginals</p>
            <div className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                Admin Console
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex flex-col gap-1.5">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeItem?.href === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                // Tapping a link navigates — the drawer must not survive it.
                onClick={() => setDrawerOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 px-3.5 py-3 lg:py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-amber-400/20 to-rose-500/20 text-amber-300 border border-amber-400/30"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-amber-400" : "text-white/40"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Identity, sign out & return to app */}
      <div className="pt-6 border-t border-white/10 flex flex-col gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <div className="flex flex-col overflow-hidden">
            <span className="text-xs text-white font-medium truncate">{admin.name}</span>
            <span className="text-[10px] text-white/40">{ROLE_LABELS[admin.role]}</span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center justify-center gap-2 w-full py-3 lg:py-2.5 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-white/70 hover:text-red-400 text-xs font-medium transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
        <Link
          href="/"
          onClick={() => setDrawerOpen(false)}
          className="flex items-center justify-center gap-2 w-full py-3 lg:py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-medium transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Customer Try-On App
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar — the drawer's only entry point below lg */}
      <header className="lg:hidden sticky top-0 z-40 border-b border-white/10 bg-[#060606]/90 backdrop-blur-md pt-safe">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open admin navigation"
            aria-expanded={drawerOpen}
            aria-controls="admin-nav-drawer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors active:bg-white/15 active:text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-500 shadow-lg shadow-rose-500/25">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold tracking-tight text-white">
              {activeItem?.label ?? "HairOriginals"}
            </p>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Admin Console
            </span>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70 animate-overlay-in"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            id="admin-nav-drawer"
            className="absolute inset-y-0 left-0 flex w-[min(19rem,86vw)] flex-col overflow-y-auto border-r border-white/10 bg-[#0a0a0a] p-6 pt-safe pb-safe animate-slide-in-left"
          >
            <div className="flex justify-end pb-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close admin navigation"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 active:bg-white/15 active:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {panel}
          </div>
        </div>
      )}

      {/* Desktop rail */}
      <aside className="hidden lg:flex w-64 bg-white/[0.02] border-r border-white/10 flex-col p-6 shrink-0 min-h-screen">
        {panel}
      </aside>
    </>
  );
}
