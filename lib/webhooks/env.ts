/**
 * lib/webhooks/env.ts
 *
 * Resolves the DC CRM (Digicuro) webhook configuration from the environment.
 * Secrets stay in env (never the DB), mirroring lib/supabase/env.ts. Delivery
 * is a no-op if unconfigured (returns null) so local/dev without a CRM endpoint
 * doesn't error; the sweeper simply leaves events pending.
 *
 * The integration is one-way (app → CRM lead intake). We authenticate with the
 * Bearer token Digicuro issues for our vendor account. See
 * docs/crm-webhook-integration.md.
 */

export interface CrmWebhookConfig {
  /** Digicuro's vendor-lead intake endpoint. */
  url: string;
  /** Bearer token (`vlk_…`) issued by Digicuro — sent as `Authorization: Bearer`. */
  token: string;
}

/** Outbound CRM config, or null if not fully configured. */
export function getCrmWebhookConfig(): CrmWebhookConfig | null {
  const url = process.env.CRM_WEBHOOK_URL;
  const token = process.env.CRM_WEBHOOK_TOKEN;
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

/** Bearer secret guarding the cron sweeper endpoint. Null if unset. */
export function getCronSecret(): string | null {
  return process.env.CRON_SECRET || null;
}
