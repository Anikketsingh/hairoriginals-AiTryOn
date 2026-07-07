-- ============================================================
-- Phase 0b: Explicit permission grants for API roles
-- ============================================================
-- Required because config.toml has auto_expose_new_tables disabled
-- (the new Supabase default as of 2026). Without this, the PostgREST
-- API roles (anon, authenticated, service_role) cannot access tables
-- even when using the service_role key.
--
-- Our architecture (Option A):
--   service_role → ALL access (Route Handlers, bypasses RLS)
--   authenticated → no data table access (browser only uses Auth)
--   anon          → no data table access (browser only uses Auth)
-- ============================================================

-- Schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role: full access to all tables, sequences, and functions
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- For future migrations: make service_role the default grantee
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO service_role;

-- anon and authenticated: no privileges on data tables.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
