/**
 * lib/webhooks/delivery.ts
 *
 * Delivers integration_events to the DC CRM. Each event is POSTed as a signed
 * JSON envelope; the CRM verifies X-Api-Key + an HMAC-SHA256 signature over the
 * raw body. Failures back off exponentially and terminate in a 'dead' state
 * after max_attempts (dead-letter). See docs/crm-webhook-integration.md.
 *
 * Server-only.
 */

import { createHmac } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCrmWebhookConfig } from "@/lib/webhooks/env";

/** Only these event types are pushed to the CRM (per the agreed contract). */
export const DELIVERABLE_EVENT_TYPES = ["lead.created", "lead.updated"] as const;

const REQUEST_TIMEOUT_MS = 10_000;
const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_CAP_SECONDS = 3600; // 1h

interface EventRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  created_at: string;
}

/** `sha256=<hex>` HMAC of the raw body — the signature the CRM must recompute. */
export function signBody(secret: string, rawBody: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function backoffSeconds(attempts: number): number {
  return Math.min(BACKOFF_CAP_SECONDS, BACKOFF_BASE_SECONDS * 2 ** attempts);
}

/** Best-effort: persist the CRM's own lead id back onto our lead for later matching. */
async function captureCrmLeadId(payload: Record<string, unknown>, responseBody: string): Promise<void> {
  const leadId = payload.leadId as string | undefined;
  if (!leadId) return;
  try {
    const parsed = JSON.parse(responseBody) as Record<string, unknown>;
    const crmLeadId = (parsed.crm_lead_id ?? parsed.crmLeadId ?? parsed.id ?? parsed.lead_id) as
      | string
      | number
      | undefined;
    if (crmLeadId != null) {
      await supabaseAdmin
        .from("leads")
        .update({ crm_lead_id: String(crmLeadId) })
        .eq("id", leadId)
        .is("crm_lead_id", null);
    }
  } catch {
    // Non-JSON / no id in response — fine, matching can also key on our leadId.
  }
}

async function markDelivered(event: EventRow): Promise<void> {
  await supabaseAdmin
    .from("integration_events")
    .update({
      status: "delivered",
      attempts: event.attempts + 1,
      delivered_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      error_log: null,
    })
    .eq("id", event.id);
}

async function markFailure(event: EventRow, error: string): Promise<void> {
  const attempts = event.attempts + 1;
  const dead = attempts >= event.max_attempts;
  const nextAttempt = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString();
  await supabaseAdmin
    .from("integration_events")
    .update({
      status: dead ? "dead" : "failed",
      attempts,
      next_attempt_at: nextAttempt,
      processed_at: new Date().toISOString(),
      error_log: error.slice(0, 2000),
    })
    .eq("id", event.id);
}

/**
 * Deliver a single event to the CRM. Returns 'delivered' | 'failed' | 'dead' |
 * 'skipped'. Skipped means not a deliverable type or CRM not configured.
 */
export async function deliverEvent(event: EventRow): Promise<string> {
  if (!DELIVERABLE_EVENT_TYPES.includes(event.event_type as (typeof DELIVERABLE_EVENT_TYPES)[number])) {
    return "skipped";
  }
  const config = getCrmWebhookConfig();
  if (!config) {
    console.warn("[webhooks] CRM not configured — leaving event pending:", event.id);
    return "skipped";
  }

  const envelope = {
    id: event.idempotency_key ?? event.id,
    type: event.event_type,
    createdAt: event.created_at,
    data: event.payload,
  };
  const rawBody = JSON.stringify(envelope);
  const signature = signBody(config.outboundSecret, rawBody);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": config.apiKey,
        "X-Signature": signature,
        "X-Idempotency-Key": envelope.id,
        "X-Event-Type": event.event_type,
      },
      body: rawBody,
      signal: controller.signal,
    });

    const responseBody = await res.text();
    if (res.ok) {
      await captureCrmLeadId(event.payload, responseBody);
      await markDelivered(event);
      return "delivered";
    }
    await markFailure(event, `HTTP ${res.status}: ${responseBody.slice(0, 500)}`);
    return event.attempts + 1 >= event.max_attempts ? "dead" : "failed";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailure(event, message);
    return event.attempts + 1 >= event.max_attempts ? "dead" : "failed";
  } finally {
    clearTimeout(timer);
  }
}

/** Deliver one event by id (used by the immediate after() path). Best-effort. */
export async function deliverEventById(eventId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("integration_events")
    .select("id, event_type, payload, attempts, max_attempts, idempotency_key, created_at, status")
    .eq("id", eventId)
    .single();
  if (!data || data.status === "delivered" || data.status === "dead") return;
  await deliverEvent(data as EventRow);
}

/**
 * Drain a batch of due events (pending/failed, next_attempt_at <= now). Used by
 * the cron sweeper. Returns a small summary for observability.
 */
export async function sweepDueEvents(limit = 25): Promise<{ processed: number; results: Record<string, number> }> {
  const { data: due } = await supabaseAdmin
    .from("integration_events")
    .select("id, event_type, payload, attempts, max_attempts, idempotency_key, created_at")
    .in("status", ["pending", "failed"])
    .in("event_type", DELIVERABLE_EVENT_TYPES as unknown as string[])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  const results: Record<string, number> = {};
  for (const event of (due ?? []) as EventRow[]) {
    const outcome = await deliverEvent(event);
    results[outcome] = (results[outcome] ?? 0) + 1;
  }
  return { processed: (due ?? []).length, results };
}
