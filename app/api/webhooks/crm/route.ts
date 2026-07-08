/**
 * POST /api/webhooks/crm
 *
 * Inbound status callback from the DC CRM (the master). The CRM calls this
 * whenever a lead changes on its side (agent assigned, contacted, qualified,
 * converted, lost) and we mirror it onto our `leads` row so the in-app agent
 * view stays consistent.
 *
 * Auth: X-Api-Key must match CRM_WEBHOOK_API_KEY, AND X-Signature must be a
 * valid HMAC-SHA256 (`sha256=<hex>`) of the raw body using CRM_INBOUND_SECRET.
 *
 * Body: {
 *   lead_id?: string,        // our leads.id (preferred — we send it on lead.created)
 *   crm_lead_id?: string,    // the CRM's own id (fallback match)
 *   status: string,          // new | contacted | qualified | converted | lost
 *   assigned_agent?: string, // CRM agent identifier (informational)
 *   notes?: string,
 *   occurred_at?: string     // ISO — used to drop out-of-order updates
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { getCrmInboundSecret, getCrmInboundApiKey } from "@/lib/webhooks/env";

const VALID_STATUSES = ["new", "contacted", "qualified", "converted", "lost"];

function signatureMatches(secret: string, rawBody: string, provided: string | null): boolean {
  if (!provided) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = getCrmInboundSecret();
  const apiKey = getCrmInboundApiKey();
  if (!secret || !apiKey) {
    return NextResponse.json({ error: "Inbound CRM webhook is not configured." }, { status: 503 });
  }

  // Read the RAW body first — the signature is computed over these exact bytes.
  const rawBody = await request.text();

  if (request.headers.get("x-api-key") !== apiKey) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
  }
  if (!signatureMatches(secret, rawBody, request.headers.get("x-signature"))) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const leadId = (body.lead_id as string | undefined) ?? null;
  const crmLeadId = (body.crm_lead_id as string | undefined) ?? null;
  const status = (body.status as string | undefined) ?? null;
  const notes = (body.notes as string | undefined) ?? null;
  const assignedAgent = (body.assigned_agent as string | undefined) ?? null;
  const occurredAt = (body.occurred_at as string | undefined) ?? null;

  if (!leadId && !crmLeadId) {
    return NextResponse.json({ error: "One of lead_id or crm_lead_id is required." }, { status: 400 });
  }

  // Resolve our lead (prefer our own id, else the CRM's stored id).
  const query = supabaseAdmin.from("leads").select("id, status, updated_at, crm_lead_id, notes");
  const { data: lead } = leadId
    ? await query.eq("id", leadId).maybeSingle()
    : await query.eq("crm_lead_id", crmLeadId!).maybeSingle();

  if (!lead) {
    // 200 so the CRM doesn't retry a lead we don't have (e.g. a test payload).
    return NextResponse.json({ ok: true, ignored: "lead_not_found" });
  }

  // Drop stale/out-of-order updates.
  if (occurredAt && lead.updated_at && new Date(occurredAt) < new Date(lead.updated_at as string)) {
    return NextResponse.json({ ok: true, ignored: "stale_update" });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let statusChanged = false;
  if (status && VALID_STATUSES.includes(status) && status !== lead.status) {
    update.status = status;
    statusChanged = true;
  }
  if (crmLeadId && !lead.crm_lead_id) update.crm_lead_id = crmLeadId;
  if (assignedAgent || notes) {
    const stamp = new Date().toISOString();
    const line = `[${stamp}] CRM${assignedAgent ? ` agent=${assignedAgent}` : ""}${notes ? `: ${notes}` : ""}`;
    update.notes = lead.notes ? `${lead.notes}\n${line}` : line;
  }

  const { error } = await supabaseAdmin.from("leads").update(update).eq("id", lead.id);
  if (error) {
    console.error("[/api/webhooks/crm] Update error:", error.message);
    return NextResponse.json({ error: "Failed to apply update." }, { status: 500 });
  }

  if (statusChanged) {
    await recordAnalyticsEvent("lead_status_synced", { leadId: lead.id, status, source: "crm" }, null, null);
  }

  return NextResponse.json({ ok: true, leadId: lead.id, statusChanged });
}
