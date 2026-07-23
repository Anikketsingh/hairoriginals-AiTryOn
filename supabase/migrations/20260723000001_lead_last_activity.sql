-- ============================================================
-- Track when a lead last engaged (created a try-on), so the CRM
-- can surface returning customers at the top of the list.
-- ============================================================
-- The CRM list was ordered by created_at — the moment the lead was
-- *first* captured — so a customer who comes back days later and
-- generates more looks stayed buried at the bottom. updated_at can't
-- fill this role: the trg_leads_updated_at trigger bumps it on *any*
-- update, including agent status changes and notes, so it reflects
-- "last touched by anyone", not "customer last tried on".
--
-- last_activity_at is bumped only by refreshLeadActivity (lib/leads.ts),
-- which runs after each completed generation — a clean "customer came
-- back and tried more" signal to sort and badge on.
-- ============================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Backfill existing rows so the new default sort has a value for every
-- lead. GREATEST(created_at, updated_at) is the best available proxy for
-- last engagement on historical rows.
UPDATE public.leads
  SET last_activity_at = GREATEST(created_at, COALESCE(updated_at, created_at))
  WHERE last_activity_at IS NULL;

-- New leads start "active" at creation; refreshLeadActivity moves it forward.
ALTER TABLE public.leads ALTER COLUMN last_activity_at SET DEFAULT NOW();

-- Default CRM sort is last_activity_at DESC — index it.
CREATE INDEX IF NOT EXISTS idx_leads_last_activity ON leads(last_activity_at DESC);
