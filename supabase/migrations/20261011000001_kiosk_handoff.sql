-- ============================================================
-- Standee → phone handoff
--
-- The result screen on a standee shows a QR code. The visitor scans it, lands
-- on /s/<token> on their own phone, enters their number, and gets their looks
-- by SMS plus a home-trial offer, WhatsApp and call options. Each number is a
-- "Standee Lead" tied to the standee that produced it, and every interest the
-- visitor shows on the phone page is recorded for the sales team.
--
-- Apply via the Supabase dashboard SQL editor (NOT `supabase db push`).
-- ============================================================

-- ── One handoff per standee visit ─────────────────────────────
-- token is the only credential the phone has, so it is long and random
-- (minted in lib/kiosk-handoff.ts). Before a number is entered the link
-- expires quickly (expires_at); after, the phone page stays usable for the
-- life of the download link.
CREATE TABLE IF NOT EXISTS kiosk_handoffs (
  token          TEXT PRIMARY KEY,
  session_id     UUID NOT NULL UNIQUE REFERENCES device_sessions(id) ON DELETE CASCADE,
  kiosk_id       UUID REFERENCES kiosks(id) ON DELETE SET NULL,
  lead_id        UUID REFERENCES leads(id) ON DELETE SET NULL,
  phone          TEXT,
  contact_name   TEXT,
  sms_sent_count INTEGER NOT NULL DEFAULT 0,
  scanned_at     TIMESTAMPTZ,
  claimed_at     TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kiosk_handoffs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_kiosk_handoffs_kiosk_created ON kiosk_handoffs(kiosk_id, created_at DESC);

-- ── Interest timeline for Standee Leads ───────────────────────
-- lead_id is NULL for the events that happen before a number exists
-- (qr_shown, qr_scanned); those still count toward the per-standee funnel.
CREATE TABLE IF NOT EXISTS kiosk_lead_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID REFERENCES leads(id) ON DELETE CASCADE,
  kiosk_id       UUID REFERENCES kiosks(id) ON DELETE SET NULL,
  handoff_token  TEXT REFERENCES kiosk_handoffs(token) ON DELETE SET NULL,
  event          TEXT NOT NULL CHECK (event IN (
                   'qr_shown', 'qr_scanned', 'number_submitted', 'photo_link_sent',
                   'home_trial_interest', 'whatsapp_clicked', 'call_clicked', 'store_clicked'
                 )),
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kiosk_lead_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_kiosk_lead_events_lead          ON kiosk_lead_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kiosk_lead_events_kiosk_created ON kiosk_lead_events(kiosk_id, created_at DESC);

-- ── Quick-filter flags on the lead itself ─────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS home_trial_interest_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS photo_link_sent_at     TIMESTAMPTZ;

-- ── Download links can cover a whole visit ────────────────────
-- The SMS carries ONE link; it shows every look from the visit.
ALTER TABLE result_downloads ALTER COLUMN generation_id DROP NOT NULL;
ALTER TABLE result_downloads ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES device_sessions(id) ON DELETE CASCADE;
ALTER TABLE result_downloads DROP CONSTRAINT IF EXISTS result_downloads_has_target;
ALTER TABLE result_downloads
  ADD CONSTRAINT result_downloads_has_target CHECK (generation_id IS NOT NULL OR session_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_result_downloads_session ON result_downloads(session_id) WHERE session_id IS NOT NULL;

-- ── Admin-editable offer & contact (Admin → Kiosks) ───────────
-- Seeded here because the admin settings save is an UPDATE: a key with no
-- row would silently never save.
INSERT INTO settings (key, value, description) VALUES
  ('kiosk_offer_discount_percent', '10',
   'Home-trial discount (%) offered to customers who book from a standee''s phone page.'),
  ('kiosk_offer_title', '"Book a home trial from here — get {discount}% off"',
   'Headline of the home-trial offer on the standee phone page. {discount} is replaced with kiosk_offer_discount_percent.'),
  ('kiosk_offer_text', '"A HairOriginals stylist brings the hair to your home so you can try it before you buy. This discount is only for standee customers."',
   'Body copy of the home-trial offer on the standee phone page.'),
  ('kiosk_offer_coupon_code', '""',
   'Optional coupon code shown with the standee home-trial offer. Empty hides it.'),
  ('kiosk_whatsapp_number', '""',
   'HairOriginals WhatsApp number (with country code, digits only, e.g. 919876543210) for the standee phone page.'),
  ('kiosk_contact_phone', '""',
   'Phone number the standee phone page''s "Call us" button dials (e.g. +919876543210).')
ON CONFLICT (key) DO NOTHING;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
