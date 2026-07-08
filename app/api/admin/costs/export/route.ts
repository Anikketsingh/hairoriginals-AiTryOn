import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCostsAccess } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const admin = await requireCostsAccess();
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "generations";

    if (type === "credits") {
      // Fetch credits ledger joined with user phone/name and admin email/name
      const { data: credits, error } = await supabaseAdmin
        .from("generation_credits")
        .select("*, user:users(phone, name), admin:admin_users(email, name)")
        .order("granted_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Convert to CSV
      const headers = ["Transaction ID", "User Phone", "User Name", "Source", "Amount Granted", "Amount Consumed", "Granted At", "Expires At", "Granted By (Admin)"];
      const rows = (credits || []).map((c: any) => [
        c.id,
        c.user?.phone || "N/A",
        c.user?.name || "N/A",
        c.source,
        c.amount,
        c.consumed,
        c.granted_at,
        c.expires_at || "Never",
        c.admin?.email || "System",
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=credits_ledger_${Date.now()}.csv`,
        },
      });
    } else {
      // Default: generations — explicit columns, not `*`, to avoid pulling
      // the (unused-going-forward) result_image_base64 column into every row.
      const { data: generations, error } = await supabaseAdmin
        .from("generations")
        .select("id, status, model, duration_ms, error_log, created_at, completed_at, user:users(phone, name)")
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Convert to CSV
      const headers = ["Generation ID", "User Phone", "User Name", "Status", "Model", "Duration (ms)", "Error Log", "Created At", "Completed At"];
      const rows = (generations || []).map((g: any) => [
        g.id,
        g.user?.phone || "N/A",
        g.user?.name || "N/A",
        g.status,
        g.model || "N/A",
        g.duration_ms || 0,
        g.error_log || "N/A",
        g.created_at,
        g.completed_at || "N/A",
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=generations_history_${Date.now()}.csv`,
        },
      });
    }
  } catch (err: any) {
    console.error("Export error:", err);
    return NextResponse.json({ error: err.message || "Failed to export data" }, { status: 500 });
  }
}
