-- ============================================================
-- CRM webhook delivery: give integration_events real retry/idempotency
-- state so a worker can deliver events to the DC CRM with backoff + a
-- dead-letter terminal state, and let leads store the CRM's own id.
-- ============================================================

-- ── integration_events: delivery bookkeeping ─────────────────────────────
ALTER TABLE public.integration_events
  ADD COLUMN IF NOT EXISTS attempts        INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts    INTEGER     NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at    TIMESTAMPTZ;

-- Default the idempotency key to the row id for any existing/backfilled rows.
UPDATE public.integration_events
  SET idempotency_key = id::text
  WHERE idempotency_key IS NULL;

-- Add a terminal 'dead' status (exhausted retries). Recreate the CHECK since
-- the original (20260629000009) is inline/unnamed → integration_events_status_check.
ALTER TABLE public.integration_events DROP CONSTRAINT IF EXISTS integration_events_status_check;
ALTER TABLE public.integration_events
  ADD CONSTRAINT integration_events_status_check
  CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead'));

-- Worker sweep index: find due, not-yet-terminal rows quickly.
CREATE INDEX IF NOT EXISTS idx_integration_events_due
  ON integration_events (next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- ── leads: store the CRM's own lead id for two-way status matching ───────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS crm_lead_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_crm_lead_id ON leads(crm_lead_id);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
