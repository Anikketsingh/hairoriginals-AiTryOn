-- ============================================================
-- Move generation results out of Postgres into Supabase Storage
-- ============================================================
-- generations.result_image_base64 stored the full image as TEXT, which was
-- then returned in full on every 1.5s status poll and every history/costs
-- read. New generations now write to a private "results" bucket and store
-- just the storage path. result_image_base64 is left in place (unused
-- going forward) rather than dropped here, since already-completed rows
-- still hold data in it — drop it in a follow-up migration once confirmed
-- nothing reads it anymore.
-- ============================================================

ALTER TABLE generations ADD COLUMN IF NOT EXISTS result_image_path TEXT;

-- Private bucket — all access is service-role + short-lived signed URLs,
-- generated only after an explicit ownership check (no public/anon access).
INSERT INTO storage.buckets (id, name, public)
VALUES ('results', 'results', false)
ON CONFLICT (id) DO NOTHING;
