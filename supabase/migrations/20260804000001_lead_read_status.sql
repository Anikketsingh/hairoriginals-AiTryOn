-- ============================================================
-- Track whether a lead has been opened in the CRM, so the leads
-- list can be filtered to unread / read.
-- ============================================================
-- is_read flips to true the first time GET /api/admin/leads/[id] is
-- called for a lead (app/api/admin/leads/[id]/route.ts) — i.e. when an
-- agent opens it in the CRM workspace panel. It's a single global flag,
-- not per-agent: "read" means "someone on the team has looked at this",
-- matching how the feature was asked for.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

-- Backfill: leads that already exist predate this feature and have
-- likely already been worked — don't flood the new "unread" filter
-- with the entire historical backlog. New leads still default to
-- unread via the column default above.
UPDATE public.leads SET is_read = true WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_leads_is_read ON leads(is_read);
