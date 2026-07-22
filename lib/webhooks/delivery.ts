/**
 * lib/webhooks/delivery.ts
 *
 * Delivers integration_events to the DC CRM (Digicuro) vendor-lead intake
 * webhook. Each event is mapped to their flat lead body (lib/webhooks/crm-
 * payload.ts) and POSTed with a Bearer token. Their endpoint dedups on
 * phone/email and returns 201 { lead_id }. Failures back off exponentially and
 * terminate in a 'dead' state after max_attempts (dead-letter); malformed/auth
 * (4xx) responses dead-letter immediately. See docs/crm-webhook-integration.md.
 *
 * Server-only.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { getCrmWebhookConfig } from "@/lib/webhooks/env";
import { toCrmLeadBody, hasContact } from "@/lib/webhooks/crm-payload";

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

/**
 * Record a failed attempt. Retries with backoff until max_attempts, then
 * dead-letters — unless `terminal` (e.g. a 4xx that won't fix on retry), which
 * dead-letters immediately.
 */
async function markFailure(event: EventRow, error: string, terminal = false): Promise<void> {
  const attempts = event.attempts + 1;
  const dead = terminal || attempts >= event.max_attempts;
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
 * Terminally skip an event we can't deliver (e.g. no phone/email — Digicuro
 * requires one). Not a failure: an expected outcome for pre-signup guest
 * events, whose later lead.updated (with contact) is what creates the lead.
 * Marked 'dead' so the sweeper stops retrying; error_log flags it as skipped.
 */
async function markSkipped(event: EventRow, reason: string): Promise<void> {
  await supabaseAdmin
    .from("integration_events")
    .update({
      status: "dead",
      processed_at: new Date().toISOString(),
      error_log: `skipped: ${reason}`,
    })
    .eq("id", event.id);
}

/**
 * Deliver a single event to the CRM. Returns 'delivered' | 'failed' | 'dead' |
 * 'skipped'. Skipped means not a deliverable type or CRM not configured (event
 * left pending); no-contact events are terminally skipped (dead) instead.
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

  // Digicuro requires phone or email to dedup/identify a lead. Pre-signup guest
  // events never have either — terminally skip so we don't retry into a 400.
  if (!hasContact(event.payload)) {
    await markSkipped(event, "no phone/email");
    return "skipped";
  }

  const rawBody = JSON.stringify(toCrmLeadBody(event.payload, event.event_type));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
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
    // 4xx (bad payload / auth / paused) won't succeed on retry — dead-letter now.
    // 429 is a rate limit, so keep retrying with backoff.
    const terminal = res.status >= 400 && res.status < 500 && res.status !== 429;
    await markFailure(event, `HTTP ${res.status}: ${responseBody.slice(0, 500)}`, terminal);
    return terminal || event.attempts + 1 >= event.max_attempts ? "dead" : "failed";
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
