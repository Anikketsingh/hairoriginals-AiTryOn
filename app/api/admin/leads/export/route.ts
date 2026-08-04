/**
 * GET /api/admin/leads/export
 *
 * Exports the CRM leads list to a real .xlsx workbook — same auth, row
 * scoping, and filters as GET /api/admin/leads (see lib/lead-filters.ts),
 * so the export always matches what the agent has on screen. One wide row
 * per lead: contact info, lead type, try-on counts, products, credits,
 * latest feedback, and the assigned agent's activity.
 *
 * Uses exceljs (not CSV) specifically so phone numbers survive as text —
 * Excel renders a bare CSV phone number in scientific notation.
 */

export const runtime = "nodejs"; // exceljs needs Node APIs, not the edge runtime
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { applyLeadFilters, resolveSort } from "@/lib/lead-filters";
import { crmMediaUrl } from "@/lib/leads";

/** Hard cap so one export can't run away on a huge lead book. */
const EXPORT_ROW_CAP = 5000;
/** PostgREST/.in() practical URL-length safety margin. */
const IN_CHUNK_SIZE = 200;

const LEAD_TYPE_LABEL: Record<string, string> = {
  agent_gate: "Agent Gate",
  talk_to_expert: "Talk to Expert",
  manual: "Manual",
  registration: "Registered",
};

const INTEREST_LABEL: Record<string, string> = {
  yes: "Interested",
  maybe: "Maybe later",
  browsing: "Just browsing",
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

interface UserRow {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
}
interface SessionRow {
  id: string;
  first_seen: string;
  last_seen: string;
  generations_used: number;
}
interface AgentRow {
  id: string;
  name: string;
  email: string;
}
interface ActionRow {
  id: string;
  lead_id: string;
  action_type: string;
  notes: string | null;
  created_at: string;
}
interface FeedbackRow {
  id: string;
  lead_id: string;
  experience_rating: number;
  improvement: string | null;
  interest: string | null;
  created_at: string;
}
interface GenerationRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  status: string;
  product_id: string | null;
  created_at: string;
}
interface SavedProductRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  product_id: string;
}
interface CreditRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  amount: number;
  consumed: number;
  expires_at: string | null;
}
interface ProductRow {
  id: string;
  name: string;
}

/** Converts a UTC ISO timestamp to an IST wall-clock Date for display. */
function toIst(iso: string | null): Date | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + IST_OFFSET_MS);
}

/**
 * Excel treats a leading =, +, -, or @ as a formula. Free-text fields here
 * (notes, feedback comments, product names) are user- or agent-supplied, so
 * defuse them the same way spreadsheet tools do on import.
 */
function sanitizeText(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = String(value).slice(0, 32000); // Excel's per-cell limit is 32767
  return /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

function leadTypeOf(source: string, hasUser: boolean): string {
  if (source === "guest_tryon") return hasUser ? "Guest → Registered" : "Guest (anonymous)";
  return LEAD_TYPE_LABEL[source] ?? source;
}

/** Chunked .in() fetch — PostgREST passes ids in the URL, so long lists need splitting. */
async function fetchChunked<T>(
  ids: string[],
  fetcher: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    out.push(...(await fetcher(ids.slice(i, i + IN_CHUNK_SIZE))));
  }
  return out;
}

/** Groups owner-scoped rows (no lead_id — see lib/leads.ts ownerFilter) by user_id/session_id, deduped by row id. */
function groupByOwner<T extends { id: string; user_id: string | null; session_id: string | null }>(
  byUserRows: T[],
  bySessionRows: T[]
): { byUser: Map<string, T[]>; bySession: Map<string, T[]> } {
  const byUser = new Map<string, T[]>();
  const bySession = new Map<string, T[]>();
  const seen = new Set<string>();

  const add = (map: Map<string, T[]>, key: string | null, row: T) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  };

  for (const row of [...byUserRows, ...bySessionRows]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    add(byUser, row.user_id, row);
    add(bySession, row.session_id, row);
  }
  return { byUser, bySession };
}

/** Rows owned by this lead — dedupes rows that match on both keys (a claimed guest lead). */
function ownedRows<T extends { id: string }>(
  lead: { user_id: string | null; session_id: string | null },
  byUser: Map<string, T[]>,
  bySession: Map<string, T[]>
): T[] {
  const rows = new Map<string, T>();
  (lead.user_id ? byUser.get(lead.user_id) : undefined)?.forEach((r) => rows.set((r as { id: string }).id, r));
  (lead.session_id ? bySession.get(lead.session_id) : undefined)?.forEach((r) => rows.set((r as { id: string }).id, r));
  return [...rows.values()];
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(["super_admin", "sales_agent"]);
  if (admin instanceof NextResponse) return admin;

  try {
    const params = new URL(request.url).searchParams;
    const sort = resolveSort(params);

    let leadsQuery = supabaseAdmin
      .from("leads")
      .select(
        "id, user_id, session_id, phone, funnel_stage_at_creation, generations_count, products_tried, status, source, assigned_agent_id, crm_lead_id, notes, is_read, created_at, updated_at, last_activity_at"
      )
      .order(sort.column, { ascending: sort.ascending })
      .order("created_at", { ascending: false })
      .limit(EXPORT_ROW_CAP);

    leadsQuery = applyLeadFilters(leadsQuery, params, admin);

    const { data: leads, error } = await leadsQuery;
    if (error) {
      console.error("[/api/admin/leads/export] Fetch error:", error.message);
      return NextResponse.json({ error: "Failed to fetch leads." }, { status: 500 });
    }

    const rows = leads ?? [];
    const truncated = rows.length >= EXPORT_ROW_CAP;

    const userIds = [...new Set(rows.map((l) => l.user_id).filter((x): x is string => !!x))];
    const sessionIds = [...new Set(rows.map((l) => l.session_id).filter((x): x is string => !!x))];
    const agentIds = [...new Set(rows.map((l) => l.assigned_agent_id).filter((x): x is string => !!x))];
    const leadIds = rows.map((l) => l.id);

    const [
      users,
      sessions,
      agents,
      agentActions,
      feedback,
      generationsByUser,
      generationsBySession,
      savedByUser,
      savedBySession,
      creditsByUser,
      creditsBySession,
    ] = await Promise.all([
      fetchChunked<UserRow>(userIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("users")
          .select("id, phone, name, email")
          .in("id", chunk)
          .returns<UserRow[]>();
        return data ?? [];
      }),
      fetchChunked<SessionRow>(sessionIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("device_sessions")
          .select("id, first_seen, last_seen, generations_used")
          .in("id", chunk)
          .returns<SessionRow[]>();
        return data ?? [];
      }),
      fetchChunked<AgentRow>(agentIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("admin_users")
          .select("id, name, email")
          .in("id", chunk)
          .returns<AgentRow[]>();
        return data ?? [];
      }),
      fetchChunked<ActionRow>(leadIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("agent_actions")
          .select("id, lead_id, action_type, notes, created_at")
          .in("lead_id", chunk)
          .order("created_at", { ascending: false })
          .returns<ActionRow[]>();
        return data ?? [];
      }),
      fetchChunked<FeedbackRow>(leadIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("customer_feedback")
          .select("id, lead_id, experience_rating, improvement, interest, created_at")
          .in("lead_id", chunk)
          .order("created_at", { ascending: false })
          .returns<FeedbackRow[]>();
        return data ?? [];
      }),
      fetchChunked<GenerationRow>(userIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("generations")
          .select("id, user_id, session_id, status, product_id, created_at")
          .in("user_id", chunk)
          .returns<GenerationRow[]>();
        return data ?? [];
      }),
      fetchChunked<GenerationRow>(sessionIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("generations")
          .select("id, user_id, session_id, status, product_id, created_at")
          .in("session_id", chunk)
          .returns<GenerationRow[]>();
        return data ?? [];
      }),
      fetchChunked<SavedProductRow>(userIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("saved_products")
          .select("id, user_id, session_id, product_id")
          .in("user_id", chunk)
          .returns<SavedProductRow[]>();
        return data ?? [];
      }),
      fetchChunked<SavedProductRow>(sessionIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("saved_products")
          .select("id, user_id, session_id, product_id")
          .in("session_id", chunk)
          .returns<SavedProductRow[]>();
        return data ?? [];
      }),
      fetchChunked<CreditRow>(userIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("generation_credits")
          .select("id, user_id, session_id, amount, consumed, expires_at")
          .in("user_id", chunk)
          .returns<CreditRow[]>();
        return data ?? [];
      }),
      fetchChunked<CreditRow>(sessionIds, async (chunk) => {
        const { data } = await supabaseAdmin
          .from("generation_credits")
          .select("id, user_id, session_id, amount, consumed, expires_at")
          .in("session_id", chunk)
          .returns<CreditRow[]>();
        return data ?? [];
      }),
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const agentById = new Map(agents.map((a) => [a.id, a]));

    const actionsByLead = new Map<string, typeof agentActions>();
    for (const a of agentActions) {
      if (!actionsByLead.has(a.lead_id)) actionsByLead.set(a.lead_id, []);
      actionsByLead.get(a.lead_id)!.push(a);
    }
    const feedbackByLead = new Map<string, typeof feedback>();
    for (const f of feedback) {
      if (!feedbackByLead.has(f.lead_id)) feedbackByLead.set(f.lead_id, []);
      feedbackByLead.get(f.lead_id)!.push(f);
    }

    const generationsGrouped = groupByOwner(generationsByUser, generationsBySession);
    const savedGrouped = groupByOwner(savedByUser, savedBySession);
    const creditsGrouped = groupByOwner(creditsByUser, creditsBySession);

    // Union every product id we'll need a name for — from generations,
    // saved_products, and each lead's own products_tried snapshot.
    const productIds = new Set<string>();
    for (const g of [...generationsByUser, ...generationsBySession]) {
      if (g.product_id) productIds.add(g.product_id);
    }
    for (const s of [...savedByUser, ...savedBySession]) {
      if (s.product_id) productIds.add(s.product_id);
    }
    for (const l of rows) {
      (Array.isArray(l.products_tried) ? (l.products_tried as string[]) : []).forEach((id) => productIds.add(id));
    }
    const products = await fetchChunked<ProductRow>([...productIds], async (chunk) => {
      const { data } = await supabaseAdmin.from("products").select("id, name").in("id", chunk).returns<ProductRow[]>();
      return data ?? [];
    });
    const productNameById = new Map(products.map((p) => [p.id, p.name as string]));

    const now = Date.now();

    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Leads", { views: [{ state: "frozen", ySplit: 1 }] });

    sheet.columns = [
      { header: "Phone", key: "phone", width: 16, style: { numFmt: "@" } },
      { header: "Name", key: "name", width: 18 },
      { header: "Email", key: "email", width: 22 },
      { header: "Lead Type", key: "leadType", width: 18 },
      { header: "Status", key: "status", width: 12 },
      { header: "Read", key: "read", width: 9 },
      { header: "Try-ons (completed)", key: "tryonsCompleted", width: 16 },
      { header: "Try-ons (attempted)", key: "tryonsAttempted", width: 16 },
      { header: "Try-ons (recorded)", key: "tryonsRecorded", width: 16 },
      { header: "Products Tried", key: "productsTried", width: 30 },
      { header: "Products Saved", key: "productsSaved", width: 30 },
      { header: "Latest Look Date", key: "latestLookDate", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
      { header: "Latest Product", key: "latestProduct", width: 22 },
      { header: "Latest Look URL", key: "latestLookUrl", width: 40 },
      { header: "Latest Photo URL", key: "latestPhotoUrl", width: 40 },
      { header: "Credits Remaining", key: "creditsRemaining", width: 16 },
      { header: "Credits Used", key: "creditsUsed", width: 14 },
      { header: "Feedback Count", key: "feedbackCount", width: 14 },
      { header: "Latest Rating", key: "latestRating", width: 12 },
      { header: "Latest Interest", key: "latestInterest", width: 16 },
      { header: "Latest Comment", key: "latestComment", width: 32 },
      { header: "Assigned Agent", key: "assignedAgent", width: 20 },
      { header: "Agent Actions", key: "actionCount", width: 14 },
      { header: "Last Action", key: "lastAction", width: 14 },
      { header: "Last Action Date", key: "lastActionDate", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
      { header: "Last Note", key: "lastNote", width: 32 },
      { header: "Funnel Stage", key: "funnelStage", width: 12 },
      { header: "Source (raw)", key: "source", width: 14 },
      { header: "First Seen", key: "firstSeen", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
      { header: "Last Seen", key: "lastSeen", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
      { header: "Created At", key: "createdAt", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
      { header: "Last Activity", key: "lastActivity", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
      { header: "Updated At", key: "updatedAt", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
      { header: "Notes", key: "notes", width: 32 },
      { header: "CRM Lead ID", key: "crmLeadId", width: 16, style: { numFmt: "@" } },
      { header: "Lead ID", key: "id", width: 38, style: { numFmt: "@" } },
      { header: "User ID", key: "userId", width: 38, style: { numFmt: "@" } },
      { header: "Session ID", key: "sessionId", width: 38, style: { numFmt: "@" } },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

    for (const lead of rows) {
      const user = lead.user_id ? userById.get(lead.user_id) : undefined;
      const session = lead.session_id ? sessionById.get(lead.session_id) : undefined;
      const agent = lead.assigned_agent_id ? agentById.get(lead.assigned_agent_id) : undefined;

      const gens = ownedRows(lead, generationsGrouped.byUser, generationsGrouped.bySession);
      const completed = gens.filter((g) => g.status === "completed");
      const latest = [...completed].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      const savedProductIds = ownedRows(lead, savedGrouped.byUser, savedGrouped.bySession).map((s) => s.product_id);
      const triedProductIds = Array.isArray(lead.products_tried) ? (lead.products_tried as string[]) : [];

      const credits = ownedRows(lead, creditsGrouped.byUser, creditsGrouped.bySession).filter(
        (c) => !c.expires_at || new Date(c.expires_at).getTime() > now
      );
      const creditsRemaining = credits.reduce((sum, c) => sum + Math.max(0, c.amount - c.consumed), 0);
      const creditsUsed = credits.reduce((sum, c) => sum + c.consumed, 0);

      const leadFeedback = feedbackByLead.get(lead.id) ?? []; // pre-sorted newest first
      const latestFeedback = leadFeedback[0];

      const leadActions = actionsByLead.get(lead.id) ?? []; // pre-sorted newest first
      const latestAction = leadActions[0];

      sheet.addRow({
        phone: sanitizeText(user?.phone ?? lead.phone),
        name: sanitizeText(user?.name),
        email: sanitizeText(user?.email),
        leadType: leadTypeOf(lead.source, !!lead.user_id),
        status: lead.status,
        read: lead.is_read ? "Read" : "Unread",
        tryonsCompleted: completed.length,
        tryonsAttempted: gens.length,
        tryonsRecorded: lead.generations_count,
        productsTried: sanitizeText(triedProductIds.map((id) => productNameById.get(id)).filter(Boolean).join("; ")),
        productsSaved: sanitizeText(savedProductIds.map((id) => productNameById.get(id)).filter(Boolean).join("; ")),
        latestLookDate: toIst(latest?.created_at ?? null),
        latestProduct: sanitizeText(latest?.product_id ? productNameById.get(latest.product_id) : null),
        latestLookUrl: latest ? crmMediaUrl(latest.id, "result") : "",
        latestPhotoUrl: latest ? crmMediaUrl(latest.id, "source") : "",
        creditsRemaining,
        creditsUsed,
        feedbackCount: leadFeedback.length,
        latestRating: latestFeedback?.experience_rating ?? "",
        latestInterest: latestFeedback?.interest ? INTEREST_LABEL[latestFeedback.interest] ?? latestFeedback.interest : "",
        latestComment: sanitizeText(latestFeedback?.improvement),
        assignedAgent: sanitizeText(agent?.name),
        actionCount: leadActions.length,
        lastAction: latestAction?.action_type ?? "",
        lastActionDate: toIst(latestAction?.created_at ?? null),
        lastNote: sanitizeText(latestAction?.notes),
        funnelStage: lead.funnel_stage_at_creation,
        source: lead.source,
        firstSeen: toIst(session?.first_seen ?? null),
        lastSeen: toIst(session?.last_seen ?? null),
        createdAt: toIst(lead.created_at),
        lastActivity: toIst(lead.last_activity_at),
        updatedAt: toIst(lead.updated_at),
        notes: sanitizeText(lead.notes),
        crmLeadId: lead.crm_lead_id ?? "",
        id: lead.id,
        userId: lead.user_id ?? "",
        sessionId: lead.session_id ?? "",
      });
    }

    if (truncated) {
      const note = sheet.addRow({ phone: `Export capped at ${EXPORT_ROW_CAP} rows — narrow your filters to see the rest.` });
      note.font = { italic: true, color: { argb: "FFAA0000" } };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="leads_export_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/admin/leads/export] Error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
