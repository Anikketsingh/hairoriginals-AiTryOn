-- ============================================================
-- Kiosk (video standee) foundation
--
-- A second front end for the try-on flow runs on portrait touchscreen
-- standees at /kiosk, against this same database. Each physical standee is a
-- row in `kiosks` and authenticates with a long-lived device secret held in
-- an httpOnly cookie (see lib/kiosk-auth.ts) — only its SHA-256 lives here.
--
-- Kiosk traffic is tagged by a nullable kiosk_id on device_sessions,
-- generations and leads. NULL means the regular web app, so every existing
-- row and every existing query is unaffected.
--
-- Apply via the Supabase dashboard SQL editor (NOT `supabase db push`).
-- ============================================================

CREATE TABLE IF NOT EXISTS kiosks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  location           TEXT,
  -- SHA-256 hex of the device secret in the standee's cookie. NULL until the
  -- standee is enrolled, and again after an admin revokes it.
  token_hash         TEXT UNIQUE,
  -- SHA-256 hex of the one-time enrollment code, with its expiry. Cleared on
  -- successful enrollment so a code can only ever be used once.
  enroll_code_hash   TEXT UNIQUE,
  enroll_expires_at  TIMESTAMPTZ,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  -- Per-standee knobs; defaults live in lib/kiosk-auth.ts (KIOSK_CONFIG_DEFAULTS)
  -- so an empty object is always valid.
  config             JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at       TIMESTAMPTZ,
  app_version        TEXT,
  enrolled_at        TIMESTAMPTZ,
  created_by         UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kiosks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_kiosks_updated_at
  BEFORE UPDATE ON kiosks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Channel tagging ────────────────────────────────────────────
ALTER TABLE device_sessions ADD COLUMN IF NOT EXISTS kiosk_id UUID REFERENCES kiosks(id) ON DELETE SET NULL;
ALTER TABLE generations     ADD COLUMN IF NOT EXISTS kiosk_id UUID REFERENCES kiosks(id) ON DELETE SET NULL;
ALTER TABLE leads           ADD COLUMN IF NOT EXISTS kiosk_id UUID REFERENCES kiosks(id) ON DELETE SET NULL;

-- Kiosk visitors never sign up, so there is no users row to hold their name.
-- The phone already lives on leads.phone; the name lives here.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_name TEXT;

-- Partial: only kiosk rows are indexed, so web traffic pays nothing.
CREATE INDEX IF NOT EXISTS idx_generations_kiosk_created ON generations(kiosk_id, created_at DESC) WHERE kiosk_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_kiosk_created       ON leads(kiosk_id, created_at DESC)       WHERE kiosk_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_sessions_kiosk     ON device_sessions(kiosk_id)              WHERE kiosk_id IS NOT NULL;

-- ── leads.source: allow 'kiosk' ────────────────────────────────
-- Last redefined in 20260717000001_source_photo_and_guest_leads.sql.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_check
  CHECK (source IN ('agent_gate', 'talk_to_expert', 'manual', 'registration', 'guest_tryon', 'kiosk'));

-- ── generation_credits.source: allow 'kiosk_visitor' ───────────
-- Each walk-up visitor gets their own session + credit row. The constraint
-- was inline/unnamed in 20260629000001, so Postgres named it as below.
ALTER TABLE public.generation_credits DROP CONSTRAINT IF EXISTS generation_credits_source_check;
ALTER TABLE public.generation_credits
  ADD CONSTRAINT generation_credits_source_check
  CHECK (source IN ('guest_free', 'registered_bonus', 'agent_grant', 'promo', 'monthly_refresh', 'kiosk_visitor'));

-- ── QR result downloads ────────────────────────────────────────
-- The kiosk shows a QR code pointing at /d/<token>; the customer scans it
-- with their phone to view/download their look. Tokens are random and
-- expiring, so the underlying generation id is never exposed.
CREATE TABLE IF NOT EXISTS result_downloads (
  token           TEXT PRIMARY KEY,
  generation_id   UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  kiosk_id        UUID REFERENCES kiosks(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  download_count  INTEGER NOT NULL DEFAULT 0,
  first_opened_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.result_downloads ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_result_downloads_generation ON result_downloads(generation_id);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
