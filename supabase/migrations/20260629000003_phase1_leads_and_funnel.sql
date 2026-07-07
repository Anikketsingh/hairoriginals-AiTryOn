-- ============================================================
-- Phase 1: Leads table + consume_one_credit atomic function
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- LEADS  (CRM lead record — created at Stage 3 gate hit)
-- context.md §2.5 lead payload
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id               UUID REFERENCES device_sessions(id) ON DELETE SET NULL,
  phone                    TEXT,
  funnel_stage_at_creation INTEGER NOT NULL,    -- 3 for Stage 3 trigger, per spec
  generations_count        INTEGER NOT NULL DEFAULT 0,
  -- products_tried: Phase 3 will populate from the products table
  products_tried           JSONB NOT NULL DEFAULT '[]',
  -- selfie_refs: Phase 7 will populate from Supabase Storage
  selfie_refs              JSONB NOT NULL DEFAULT '[]',
  status                   TEXT NOT NULL DEFAULT 'new'
                             CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  source                   TEXT NOT NULL DEFAULT 'agent_gate'
                             CHECK (source IN ('agent_gate', 'talk_to_expert', 'manual')),
  assigned_agent_id        UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leads_has_owner CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_leads_user   ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_agent  ON leads(assigned_agent_id);

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────
-- ATOMIC CREDIT CONSUMPTION FUNCTION
-- Selects the oldest available credit row and increments consumed.
-- Uses FOR UPDATE SKIP LOCKED to prevent double-consumption under
-- concurrent requests (acceptable for Phase 1 throughput).
-- Returns the consumed credit row's UUID, or NULL if no credits.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION consume_one_credit(
  p_session_id UUID,
  p_user_id    UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_credit_id UUID;
BEGIN
  -- Find + lock the oldest available (not fully consumed, not expired) credit row
  SELECT id INTO v_credit_id
  FROM generation_credits
  WHERE (
    (p_user_id    IS NOT NULL AND user_id    = p_user_id) OR
    (p_session_id IS NOT NULL AND session_id = p_session_id)
  )
  AND consumed < amount
  AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY granted_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_credit_id IS NULL THEN
    RETURN NULL;   -- no credits available
  END IF;

  UPDATE generation_credits
  SET consumed = consumed + 1
  WHERE id = v_credit_id;

  RETURN v_credit_id;
END;
$$;
