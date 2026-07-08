-- ============================================================
-- Create the "products" Storage bucket via migration
-- ============================================================
-- Previously app/api/admin/upload/route.ts called listBuckets/createBucket
-- on every single request. Bucket creation is a one-time operation — do it
-- here instead, matching the "results" bucket's migration in
-- 20260707000001_result_storage.sql. Public (unlike "results") since
-- product photos are shown directly in the customer-facing catalog.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'products',
  'products',
  true,
  10485760, -- 10MB, matches lib/types.ts MAX_FILE_SIZE_BYTES
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
