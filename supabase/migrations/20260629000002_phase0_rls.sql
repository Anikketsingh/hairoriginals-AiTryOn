-- ============================================================
-- Phase 0: Row Level Security (RLS)
-- ============================================================
-- Enable RLS on all Phase 0 tables.
--
-- Architecture context (Option A):
--   All DB writes/reads go through Next.js Route Handlers using the
--   service-role key, which bypasses RLS entirely. The browser-side
--   Supabase client uses the anon key ONLY for Auth calls (phone OTP)
--   and NEVER queries data tables.
--
-- Effect:
--   - service_role key (Route Handlers) → full access, bypasses RLS ✓
--   - anon key (browser) → zero access to all data tables ✓
--   - authenticated role (browser sessions) → zero access (no policies) ✓
--
-- No permissive policies are added intentionally — the entire data
-- plane is reserved for server-side Route Handlers.
-- Phase 4 will add narrow admin-role policies if any admin UI
-- features need direct client-side queries.
-- ============================================================

ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_credits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations          ENABLE ROW LEVEL SECURITY;
