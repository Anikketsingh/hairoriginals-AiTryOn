-- ============================================================
-- Phase 8: Integration Events Schema
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- INTEGRATION EVENTS (context.md §3, §6)
-- Asynchronous event/webhook bus queue for external integrations
-- (Shopify, CRM, WhatsApp, Email, Push notifications).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type          TEXT NOT NULL,    -- e.g. 'lead.created', 'generation.completed', 'credit.granted'
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  target_integration  TEXT NOT NULL DEFAULT 'webhook_bus', -- e.g. 'crm', 'whatsapp', 'email', 'shopify'
  error_log           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ
);

ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_integration_events_status ON integration_events(status);
CREATE INDEX IF NOT EXISTS idx_integration_events_type   ON integration_events(event_type);

-- ──────────────────────────────────────────────────────────────
-- GRANTS & PERMISSIONS
-- ──────────────────────────────────────────────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
