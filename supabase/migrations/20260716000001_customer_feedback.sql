-- ============================================================
-- Customer feedback (post-trial) — captured after a logged-in
-- customer's first try-on and surfaced in the Sales CRM under
-- their lead.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- CUSTOMER FEEDBACK
-- One row per submitted feedback. Owner-scoped like saved_products
-- (user_id for registered customers, session_id for guests), tied to
-- the CRM lead and the try-on / product that prompted it.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_feedback (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            UUID REFERENCES leads(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id         UUID REFERENCES device_sessions(id) ON DELETE SET NULL,
  generation_id      UUID REFERENCES generations(id) ON DELETE SET NULL,
  product_id         UUID REFERENCES products(id) ON DELETE SET NULL,
  experience_rating  INTEGER NOT NULL CHECK (experience_rating BETWEEN 1 AND 4),
  improvement        TEXT,
  interest           TEXT CHECK (interest IN ('yes', 'maybe', 'browsing')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_feedback_has_owner CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_customer_feedback_lead    ON customer_feedback(lead_id);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_user    ON customer_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_session ON customer_feedback(session_id);

-- ──────────────────────────────────────────────────────────────
-- Allow a customer-submitted 'feedback' entry in the lead activity
-- timeline. The constraint is inline/unnamed in phase5, so Postgres
-- named it agent_actions_action_type_check.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.agent_actions DROP CONSTRAINT IF EXISTS agent_actions_action_type_check;

ALTER TABLE public.agent_actions
  ADD CONSTRAINT agent_actions_action_type_check
  CHECK (action_type IN ('note', 'call', 'credit_grant', 'status_change', 'feedback'));

-- ──────────────────────────────────────────────────────────────
-- GRANTS & PERMISSIONS
-- ──────────────────────────────────────────────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
