/**
 * lib/event-bus.ts
 *
 * Integration event bus dispatch helper for external webhooks
 * (CRM, Shopify sync, WhatsApp, Email, Push notifications).
 *
 * Producing an event inserts a `pending` integration_events row. For CRM lead
 * events we also kick off an immediate best-effort delivery via after() (low
 * latency); the /api/cron/dispatch-events sweeper is the durable backstop that
 * retries anything the immediate attempt missed. See lib/webhooks/delivery.ts.
 */

import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { deliverEventById, DELIVERABLE_EVENT_TYPES } from "@/lib/webhooks/delivery";

export async function dispatchIntegrationEvent(
  eventType: string,
  payload: Record<string, unknown>,
  targetIntegration: string = "webhook_bus"
): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin
      .from("integration_events")
      .insert({
        event_type: eventType,
        payload,
        target_integration: targetIntegration,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[event-bus] Dispatch error:", error?.message);
      return;
    }

    // Immediate delivery for CRM lead events. Guarded because after() throws
    // outside a request scope (e.g. when called from within another after()
    // callback) — in that case the cron sweeper delivers instead.
    const deliverable = (DELIVERABLE_EVENT_TYPES as readonly string[]).includes(eventType);
    if (targetIntegration === "crm" && deliverable) {
      try {
        after(async () => {
          try {
            await deliverEventById(data.id as string);
          } catch (err) {
            console.error("[event-bus] Immediate delivery failed:", err);
          }
        });
      } catch {
        // Not in a request scope — the sweeper will pick this up.
      }
    }
  } catch (err) {
    console.error("[event-bus] Dispatch error:", err);
  }
}
