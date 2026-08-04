/**
 * GET /api/admin/leads/[id]
 *
 * Full lead detail for the agent view: the lead, the customer's generated
 * looks (signed result URLs), the products they're interested in (saved +
 * tried), and the agent-action timeline. Scoped like the list route —
 * sales_agent may only open their own or unassigned leads.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { toPublicStorageUrl } from "@/lib/supabase/public-url";
import { getCreditBalance } from "@/lib/funnel";

const SIGNED_URL_TTL_SECONDS = 10 * 60;

/** Batch-sign storage paths in one private bucket → Map<path, signedUrl>. */
async function signPaths(bucket: string, paths: string[]): Promise<Map<string, string>> {
  const urlByPath = new Map<string, string>();
  if (paths.length === 0) return urlByPath;

  const { data: signed } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  signed?.forEach((s) => {
    if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
  });
  return urlByPath;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(["super_admin", "sales_agent"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;

    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .select(
        "id, user_id, session_id, phone, funnel_stage_at_creation, generations_count, products_tried, status, source, assigned_agent_id, crm_lead_id, notes, is_read, created_at, updated_at, agent_actions(id, action_type, notes, credit_amount, created_at, agent_id)"
      )
      .eq("id", id)
      .single();

    if (error || !lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    // Scope: sales_agent can only view their own or unassigned leads.
    if (
      admin.role === "sales_agent" &&
      lead.assigned_agent_id &&
      lead.assigned_agent_id !== admin.id
    ) {
      return NextResponse.json({ error: "This lead is assigned to another agent." }, { status: 403 });
    }

    // Opening the lead in the CRM is what "reads" it — flip the flag once,
    // globally (not per-agent), so it drops out of the unread filter.
    if (!lead.is_read) {
      await supabaseAdmin.from("leads").update({ is_read: true }).eq("id", id);
      lead.is_read = true;
    }

    const orFilter = lead.user_id
      ? `user_id.eq.${lead.user_id},session_id.eq.${lead.session_id}`
      : `session_id.eq.${lead.session_id}`;

    // Customer's generated looks (completed) — sign both the captured photo
    // and the result so the agent sees a before/after pair (reuses the
    // pattern in app/api/customer/history/route.ts).
    const { data: generations } = await supabaseAdmin
      .from("generations")
      .select(
        "id, status, result_image_path, result_mime_type, source_image_path, source_mime_type, created_at, products(id, name, image_url, price)"
      )
      .or(orFilter)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    const collectPaths = (key: "result_image_path" | "source_image_path") =>
      (generations ?? []).map((g) => g[key]).filter((p): p is string => !!p);

    const [resultUrlByPath, sourceUrlByPath] = await Promise.all([
      signPaths("results", collectPaths("result_image_path")),
      signPaths("sources", collectPaths("source_image_path")),
    ]);

    const looks = (generations ?? []).map(
      ({ result_image_path, source_image_path, products, ...rest }) => ({
        ...rest,
        products: products
          ? { ...products, image_url: toPublicStorageUrl((products as { image_url?: string | null }).image_url) }
          : products,
        result_url: toPublicStorageUrl(
          result_image_path ? resultUrlByPath.get(result_image_path) ?? null : null
        ),
        // null for every look generated before source photos were stored —
        // the CRM falls back to showing the result alone.
        source_url: toPublicStorageUrl(
          source_image_path ? sourceUrlByPath.get(source_image_path) ?? null : null
        ),
      })
    );

    // Interested products = explicitly saved styles ∪ styles they tried.
    const { data: saved } = await supabaseAdmin
      .from("saved_products")
      .select("product_id, products(id, name, image_url, price, selling_price, slug)")
      .or(orFilter);

    const triedIds = Array.isArray(lead.products_tried) ? (lead.products_tried as string[]) : [];
    const savedIds = new Set((saved ?? []).map((s) => s.product_id as string));
    const missingTried = triedIds.filter((pid) => !savedIds.has(pid));

    const { data: triedProducts } = missingTried.length
      ? await supabaseAdmin
          .from("products")
          .select("id, name, image_url, price, selling_price, slug")
          .in("id", missingTried)
      : { data: [] as unknown[] };

    const interestedProducts = [
      ...(saved ?? []).map((s) => {
        const product = s.products as { image_url?: string | null };
        return { ...product, image_url: toPublicStorageUrl(product?.image_url), saved: true };
      }),
      ...((triedProducts ?? []) as { image_url?: string | null }[]).map((p) => ({
        ...p,
        image_url: toPublicStorageUrl(p.image_url),
        saved: false,
      })),
    ];

    // Customer's post-trial feedback for this lead (newest first).
    const { data: feedback } = await supabaseAdmin
      .from("customer_feedback")
      .select("id, experience_rating, improvement, interest, created_at, products(name)")
      .eq("lead_id", id)
      .order("created_at", { ascending: false });

    const credits = await getCreditBalance(lead.session_id, lead.user_id);

    return NextResponse.json({ lead, looks, interestedProducts, feedback: feedback ?? [], credits });
  } catch (err) {
    console.error("[/api/admin/leads/[id]] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
