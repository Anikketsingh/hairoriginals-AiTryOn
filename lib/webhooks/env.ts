/**
 * lib/webhooks/env.ts
 *
 * Resolves the DC CRM webhook configuration from the environment. Secrets stay
 * in env (never the DB), mirroring lib/supabase/env.ts. Delivery is a no-op if
 * unconfigured (returns null) so local/dev without a CRM endpoint doesn't error;
 * the sweeper simply leaves events pending.
 */

export interface CrmWebhookConfig {
  url: string;
  apiKey: string;
  /** HMAC secret we sign OUTBOUND payloads with (CRM-provided). */
  outboundSecret: string;
}

/** Outbound CRM config, or null if not fully configured. */
export function getCrmWebhookConfig(): CrmWebhookConfig | null {
  const url = process.env.CRM_WEBHOOK_URL;
  const apiKey = process.env.CRM_WEBHOOK_API_KEY;
  const outboundSecret = process.env.CRM_WEBHOOK_SECRET;
  if (!url || !apiKey || !outboundSecret) {
    return null;
  }
  return { url, apiKey, outboundSecret };
}

/** Shared secret the CRM signs INBOUND status callbacks with. Null if unset. */
export function getCrmInboundSecret(): string | null {
  return process.env.CRM_INBOUND_SECRET || null;
}

/** API key the CRM must present on inbound callbacks. Falls back to the outbound key. */
export function getCrmInboundApiKey(): string | null {
  return process.env.CRM_WEBHOOK_API_KEY || null;
}

/** Bearer secret guarding the cron sweeper endpoint. Null if unset. */
export function getCronSecret(): string | null {
  return process.env.CRON_SECRET || null;
}
