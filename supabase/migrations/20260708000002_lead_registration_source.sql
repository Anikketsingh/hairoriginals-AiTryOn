-- ============================================================
-- CRM funnel change: leads can now be created at sign-in (registration),
-- not only at the stage-3 agent gate.
-- ============================================================
-- Extends the leads.source CHECK to allow 'registration'. The constraint is
-- inline/unnamed in 20260629000003, so Postgres named it leads_source_check.

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_check
  CHECK (source IN ('agent_gate', 'talk_to_expert', 'manual', 'registration'));