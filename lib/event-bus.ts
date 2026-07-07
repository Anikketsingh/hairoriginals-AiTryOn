/**
 * lib/event-bus.ts
 *
 * Integration event bus dispatch helper for external webhooks
 * (CRM, Shopify sync, WhatsApp, Email, Push notifications).
 */

import { supabaseAdmin } from "@/lib/supabase/server";

export async function dispatchIntegrationEvent(
  eventType: string,
  payload: Record<string, unknown>,
  targetIntegration: string = "webhook_bus"
): Promise<void> {
  try {
    await supabaseAdmin.from("integration_events").insert({
      event_type: eventType,
      payload,
      target_integration: targetIntegration,
      status: "pending",
    });
  } catch (err) {
    console.error("[event-bus] Dispatch error:", err);
  }
}
