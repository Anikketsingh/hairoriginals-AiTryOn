-- ============================================================
-- "kiosk-media" Storage bucket — attract-screen videos for the standees
--
-- Each standee loops its own video on the idle screen; admins upload it
-- from Admin → Kiosks. Public because the standee's browser plays it
-- directly (it's marketing content, nothing private).
--
-- Uploads go browser → Storage via a signed upload URL minted by
-- /api/admin/kiosks/[id]/video, never through a route handler: a video is
-- far larger than Vercel's 4.5MB request-body cap.
--
-- 50MB matches the Supabase free-plan per-file ceiling; a 30-60s 1080x1920
-- H.264 loop fits comfortably.
--
-- Apply via the Supabase dashboard SQL editor.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kiosk-media',
  'kiosk-media',
  true,
  52428800, -- 50MB
  ARRAY['video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;
