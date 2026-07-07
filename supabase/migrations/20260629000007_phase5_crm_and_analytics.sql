-- ============================================================
-- Phase 5: CRM AgentActions & AnalyticsEvents Schema
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- AGENT ACTIONS (context.md §2.2, §2.4, §6)
-- Tracks sales agent follow-ups, phone call logs, notes, and
-- Stage 4 credit grants.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE,
  action_type   TEXT NOT NULL CHECK (action_type IN ('note', 'call', 'credit_grant', 'status_change')),
  notes         TEXT,
  credit_amount INTEGER CHECK (credit_amount > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agent_actions_lead  ON agent_actions(lead_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_agent ON agent_actions(agent_id);

-- ──────────────────────────────────────────────────────────────
-- ANALYTICS EVENTS (context.md §7)
-- Event instrumentation tracking user progression through the gating funnel.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id    UUID REFERENCES device_sessions(id) ON DELETE SET NULL,
  event_name    TEXT NOT NULL,
  funnel_stage  INTEGER,
  properties    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_analytics_events_name    ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);

-- ──────────────────────────────────────────────────────────────
-- GRANTS & PERMISSIONS
-- ──────────────────────────────────────────────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
