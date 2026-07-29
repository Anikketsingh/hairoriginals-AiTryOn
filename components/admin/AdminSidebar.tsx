"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Package, Sliders, BookOpen, UserCheck, BarChart3, ExternalLink, Sparkles, Shield, Coins, LogOut, Users, Palette } from "lucide-react";
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
  const visibleNavItems = NAV_ITEMS.filter((item) => item.roles.includes(admin.role));

  const handleSignOut = async () => {
    await supabaseAdminBrowserClient.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <aside className="w-64 bg-white/[0.02] border-r border-white/10 flex flex-col justify-between p-6 shrink-0 min-h-screen">
      <div className="flex flex-col gap-8">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/25">
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
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-amber-400/20 to-rose-500/20 text-amber-300 border border-amber-400/30"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-amber-400" : "text-white/40"}`} />
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
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-white/70 hover:text-red-400 text-xs font-medium transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-medium transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Customer Try-On App
        </Link>
      </div>
    </aside>
  );
}
