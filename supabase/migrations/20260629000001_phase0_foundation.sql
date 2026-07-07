-- ============================================================
-- Phase 0: Foundation Schema
-- HairOriginals AI Platform V2
-- ============================================================
-- Tables: users, admin_users, settings, device_sessions,
--         generation_credits, generations
-- Seed:   settings rows for all funnel config values (context.md §2.3)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- HELPER: auto-update updated_at on any table that uses it
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- USERS  (customer accounts, linked to Supabase Auth)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE,           -- auth.users.id from Supabase Auth (phone OTP)
  phone       TEXT UNIQUE,
  name        TEXT,
  email       TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended', 'banned')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create a users row when Supabase Auth creates a phone-OTP account.
-- Runs in the auth schema so it fires regardless of API path.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (auth_id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Only create the trigger if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
  END IF;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- ADMIN USERS  (staff accounts — Super Admin / Content Mgr / Sales Agent)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE,           -- auth.users.id (email/magic-link auth for admins)
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'content_manager'
                CHECK (role IN ('super_admin', 'content_manager', 'sales_agent')),
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────
-- SETTINGS  (admin-editable platform config — no code deploy needed)
-- All values stored as JSONB so the type (string/number/boolean/null) is preserved.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ──────────────────────────────────────────────────────────────
-- DEVICE SESSIONS  (backs the soft guest-quota gate — context.md §2.4)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_hash  TEXT NOT NULL,
  ip_hash           TEXT,
  session_token     TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  first_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generations_used  INTEGER NOT NULL DEFAULT 0 CHECK (generations_used >= 0),
  -- populated when this guest session is linked to a real account after login
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_token       ON device_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_device_sessions_fingerprint ON device_sessions(fingerprint_hash);

-- ──────────────────────────────────────────────────────────────
-- GENERATION CREDITS  (credits ledger — context.md §2.2)
-- Balance = SUM(amount) − SUM(consumed) across all rows for a user/session.
-- Each grant source is a separate row for full auditability.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generation_credits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One of these must be set (guest sessions use session_id, registered users use user_id)
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES device_sessions(id) ON DELETE CASCADE,
  source      TEXT NOT NULL
                CHECK (source IN (
                  'guest_free',        -- Stage 0: 1 generation for anonymous guest
                  'registered_bonus',  -- Stage 2: +2 on account creation
                  'agent_grant',       -- Stage 4: manually granted by sales agent
                  'promo',             -- future: promo code or campaign
                  'monthly_refresh'    -- future: recurring refresh (disabled by default)
                )),
  amount      INTEGER NOT NULL CHECK (amount > 0),
  consumed    INTEGER NOT NULL DEFAULT 0 CHECK (consumed >= 0),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,           -- NULL = no expiry (default per context.md §11.3)
  granted_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT credits_has_owner CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_generation_credits_user    ON generation_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_credits_session ON generation_credits(session_id);

-- ──────────────────────────────────────────────────────────────
-- GENERATIONS  (persists every try-on attempt)
-- Phase 2 will convert the route to async; status column is already here.
-- Phase 3 will add product_id FK once the products table exists.
-- Phase 4 will add prompt_template_id FK once prompt_templates exists.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner — one of these will be set
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id            UUID REFERENCES device_sessions(id) ON DELETE SET NULL,
  -- Which credit row was decremented for this generation
  credit_id             UUID REFERENCES generation_credits(id) ON DELETE SET NULL,
  -- Lifecycle
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  -- Result (temporary base64 storage; Phase 2+ will use Supabase Storage paths)
  result_image_base64   TEXT,
  result_mime_type      TEXT,
  -- AI metadata (populated from lib/gemini.ts)
  model                 TEXT,
  prompt_used           TEXT,
  duration_ms           INTEGER,
  error_log             TEXT,
  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  CONSTRAINT generations_has_owner CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_generations_user    ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_session ON generations(session_id);
CREATE INDEX IF NOT EXISTS idx_generations_status  ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_created ON generations(created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- SETTINGS SEED DATA  (all funnel & AI config values)
-- Sources: context.md §2.3 and §11 (open questions → defaults documented)
-- Every value is flagged with a comment indicating its §11 open-question status.
-- ──────────────────────────────────────────────────────────────
INSERT INTO settings (key, value, description) VALUES

  -- Funnel limits (context.md §2.3)
  ('guest_free_generations',
   '1',
   'Stage 0 → 1 trigger: number of free generations for an anonymous guest session'),

  ('registered_bonus_generations',
   '2',
   'Stage 2: additional generations credited when a guest converts to a registered account'),

  ('agent_gate_enabled',
   'true',
   'Kill switch — set false to disable the hard Stage 3 block temporarily without deploying code'),

  -- Gate copy (editable from Admin Dashboard, no deploy)
  ('login_gate_message',
   '"Loved how that looked? Sign in to unlock 2 more free try-ons."',
   'Message shown to users hitting the Stage 1 login gate'),

  ('agent_gate_message',
   '"You''ve tried 3 looks! Talk to a HairOriginals stylist to find your perfect match and unlock more try-ons."',
   'Message shown to users hitting the Stage 3 agent gate'),

  -- Agent grant controls (context.md §2.3)
  ('allow_agent_credit_grants',
   'true',
   'Whether Stage 4 (manual agent credit grants) is available at all'),

  ('max_agent_grant_per_action',
   '5',
   'Maximum credits a sales agent can grant to a customer in a single admin action'),

  -- Growth lever — disabled by default (context.md §2.6, §11.4)
  ('registered_monthly_refresh',
   '0',
   '[§11.4 default: disabled] Monthly credit refresh for registered users. 0 = disabled.'),

  -- AI configuration (context.md §5.6)
  ('gemini_model',
   '"gemini-3.1-flash-image"',
   'Gemini model identifier used in all generation calls via lib/gemini.ts'),

  ('max_upload_size_mb',
   '10',
   'Maximum image upload size accepted by the API route (MB)'),

  -- §11 open question defaults — all flagged for HairOriginals team confirmation

  ('agent_contact_channel',
   '"form"',
   '[§11.1 default: form] Stage 3 CTA contact channel. Options: form | whatsapp | callback'),

  ('guest_gate_mode',
   '"soft"',
   '[§11.2 default: soft] Guest quota enforcement strategy. Options: soft (fingerprint+token) | strict'),

  ('agent_credits_default_expiry',
   'null',
   '[§11.3 default: null] Default expiry for agent-granted credits in seconds. null = never expires'),

  ('content_manager_can_see_costs',
   'false',
   '[§11.6 default: false] Whether the Content Manager admin role can view AI cost data')

ON CONFLICT (key) DO NOTHING;
