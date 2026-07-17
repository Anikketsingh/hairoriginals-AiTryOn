-- ============================================================
-- Persist the customer's captured photo, and make guest try-ons
-- visible in the CRM
-- ============================================================
-- Two gaps this closes:
--
-- 1. The person photo the customer captures was never stored — it was read
--    to base64 in memory, sent to Gemini, and dropped when the job returned.
--    That made before/after impossible outside a live session. Source photos
--    now go to a private "sources" bucket, with the path on the generation
--    that produced the look (so the photo stays paired with its result) and
--    mirrored into leads.selfie_refs — the column reserved for exactly this
--    in 20260629000003 and never written until now.
--
-- 2. Guest generations already store their result image (uploadResultImage
--    doesn't branch on auth), but guests got no leads row, so the CRM had
--    nothing to hang those looks off. Guests now become a lead on their
--    first completed generation, upgraded in place to a named lead when
--    they sign in.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- SOURCE PHOTO STORAGE
-- ──────────────────────────────────────────────────────────────
ALTER TABLE generations ADD COLUMN IF NOT EXISTS source_image_path TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS source_mime_type  TEXT;

-- Private bucket, mirroring "results" (20260707000001) — this holds photos
-- of customers' faces, so all access is service-role + short-lived signed
-- URLs minted only after an explicit ownership/admin check. No public or
-- anon access, and deliberately no storage.objects policy.
INSERT INTO storage.buckets (id, name, public)
VALUES ('sources', 'sources', false)
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- GUEST LEADS
-- ──────────────────────────────────────────────────────────────
-- Extends the leads.source CHECK to allow 'guest_tryon'. The constraint is
-- inline/unnamed in 20260629000003, so Postgres named it leads_source_check
-- (same drop/re-add dance as 20260708000002).
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_check
  CHECK (source IN ('agent_gate', 'talk_to_expert', 'manual', 'registration', 'guest_tryon'));

-- Guest leads are looked up by session_id, and that lookup now runs on every
-- completed generation. Only user_id/status/assigned_agent_id were indexed.
CREATE INDEX IF NOT EXISTS idx_leads_session ON leads(session_id);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
