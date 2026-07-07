-- ============================================================
-- Phase 6: Saved & Favorite Products Schema
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- SAVED PRODUCTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES device_sessions(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saved_products_has_owner CHECK (user_id IS NOT NULL OR session_id IS NOT NULL),
  CONSTRAINT saved_products_unique UNIQUE (user_id, session_id, product_id)
);

ALTER TABLE public.saved_products ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_saved_products_user    ON saved_products(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_products_session ON saved_products(session_id);

-- ──────────────────────────────────────────────────────────────
-- FAVOURITE PRODUCTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favourite_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES device_sessions(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT favourite_products_has_owner CHECK (user_id IS NOT NULL OR session_id IS NOT NULL),
  CONSTRAINT favourite_products_unique UNIQUE (user_id, session_id, product_id)
);

ALTER TABLE public.favourite_products ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_favourite_products_user    ON favourite_products(user_id);
CREATE INDEX IF NOT EXISTS idx_favourite_products_session ON favourite_products(session_id);

-- ──────────────────────────────────────────────────────────────
-- GRANTS & PERMISSIONS
-- ──────────────────────────────────────────────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
