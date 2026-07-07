-- ============================================================
-- Phase 3: Product Catalog Schema & Sample Seed
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- CATEGORIES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT UNIQUE NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  description   TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────
-- PRODUCTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  description   TEXT,
  sku           TEXT,
  price         NUMERIC(10, 2),
  image_url     TEXT NOT NULL,    -- Main image used for AI try-on
  is_active     BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug     ON products(slug);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────
-- PRODUCT IMAGES
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  alt_text      TEXT,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

-- ──────────────────────────────────────────────────────────────
-- ALTER GENERATIONS (link product_id FK)
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generations' AND column_name = 'product_id'
  ) THEN
    ALTER TABLE generations ADD COLUMN product_id UUID REFERENCES products(id) ON DELETE SET NULL;
    CREATE INDEX idx_generations_product ON generations(product_id);
  END IF;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- GRANTS & PERMISSIONS
-- ──────────────────────────────────────────────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ──────────────────────────────────────────────────────────────
-- SEED DATA: HairOriginals Product Categories & Showcase Products
-- ──────────────────────────────────────────────────────────────

INSERT INTO categories (name, slug, description, display_order) VALUES
  ('Hair Toppers', 'hair-toppers', 'Lightweight toppers to add natural volume and seamless crown coverage.', 1),
  ('Hair Extensions', 'hair-extensions', 'Premium 100% human hair extensions for instant length and full body.', 2),
  ('Wigs', 'wigs', 'Handcrafted full-cap wigs with breathable silk bases and natural hairlines.', 3),
  ('Fringes', 'fringes', 'Clip-in clip-on bangs to transform your frontal look without cutting.', 4),
  ('Hair Patches', 'hair-patches', 'Targeted human hair patches for discrete thinning and spot coverage.', 5)
ON CONFLICT (slug) DO NOTHING;

-- Seed initial products for each category
INSERT INTO products (category_id, name, slug, description, sku, price, image_url, display_order) VALUES
  (
    (SELECT id FROM categories WHERE slug = 'hair-toppers'),
    'Silk Seamless Crown Topper',
    'silk-seamless-crown-topper',
    '5x5 inch breathable silk base topper designed for top-of-head thinning. Blends naturally with your natural parted hair.',
    'HO-TOP-01',
    14999.00,
    'https://images.unsplash.com/photo-1562158078-63687c11800d?auto=format&fit=crop&w=800&q=80',
    1
  ),
  (
    (SELECT id FROM categories WHERE slug = 'hair-toppers'),
    'Volume Plus Monofilament Topper',
    'volume-plus-mono-topper',
    'Full volume crown coverage with invisible mesh base for multi-directional parting.',
    'HO-TOP-02',
    18500.00,
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80',
    2
  ),
  (
    (SELECT id FROM categories WHERE slug = 'hair-extensions'),
    '7-Set Seamless Clip-In Extensions (20")',
    '7-set-seamless-clip-in-20',
    '200g of pure 100% Remy human hair. Ultra-flat polyurethane tracks for undetectable volume.',
    'HO-EXT-01',
    21999.00,
    'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=800&q=80',
    1
  ),
  (
    (SELECT id FROM categories WHERE slug = 'hair-extensions'),
    'Invisible Tape-In Extensions (18")',
    'invisible-tape-in-extensions-18',
    'Salon-grade medical bond tape-ins for a semi-permanent lightweight feel.',
    'HO-EXT-02',
    16999.00,
    'https://images.unsplash.com/photo-1492106087820-71f1a00d2b11?auto=format&fit=crop&w=800&q=80',
    2
  ),
  (
    (SELECT id FROM categories WHERE slug = 'wigs'),
    'Lace Front HD Natural Wave Wig',
    'lace-front-hd-natural-wave-wig',
    '13x4 HD transparent lace front wig. Pre-plucked hairline with baby hairs.',
    'HO-WIG-01',
    34999.00,
    'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=800&q=80',
    1
  ),
  (
    (SELECT id FROM categories WHERE slug = 'fringes'),
    'Clip-In Wispy Korean Fringe',
    'clip-in-wispy-korean-fringe',
    'Instant face-framing fringe with side temples. 100% human hair that can be heat styled.',
    'HO-FRG-01',
    3999.00,
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
    1
  )
ON CONFLICT (slug) DO NOTHING;
