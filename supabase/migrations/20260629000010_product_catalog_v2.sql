-- ============================================================
-- Product Catalog V2 & Gender Architecture Migration
-- ============================================================

-- 1. Extend Categories with Gender
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'gender'
  ) THEN
    ALTER TABLE categories ADD COLUMN gender TEXT NOT NULL DEFAULT 'women' CHECK (gender IN ('women', 'men', 'unisex', 'kids'));
  END IF;
END;
$$;

-- 2. Collections Table
CREATE TABLE IF NOT EXISTS collections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT UNIQUE NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  description   TEXT,
  banner_url    TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Product Collections Join Table
CREATE TABLE IF NOT EXISTS product_collections (
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, collection_id)
);

ALTER TABLE public.product_collections ENABLE ROW LEVEL SECURITY;

-- 4. Extend Products Table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'gender') THEN
    ALTER TABLE products ADD COLUMN gender TEXT NOT NULL DEFAULT 'women' CHECK (gender IN ('women', 'men', 'unisex', 'kids'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'brand') THEN
    ALTER TABLE products ADD COLUMN brand TEXT DEFAULT 'HairOriginals';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'short_description') THEN
    ALTER TABLE products ADD COLUMN short_description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'status') THEN
    ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'hair_type') THEN
    ALTER TABLE products ADD COLUMN hair_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'hair_length') THEN
    ALTER TABLE products ADD COLUMN hair_length TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'hair_density') THEN
    ALTER TABLE products ADD COLUMN hair_density TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'hair_color') THEN
    ALTER TABLE products ADD COLUMN hair_color TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'base_material') THEN
    ALTER TABLE products ADD COLUMN base_material TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'installation_type') THEN
    ALTER TABLE products ADD COLUMN installation_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'recommended_for') THEN
    ALTER TABLE products ADD COLUMN recommended_for TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'selling_price') THEN
    ALTER TABLE products ADD COLUMN selling_price NUMERIC(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'mrp') THEN
    ALTER TABLE products ADD COLUMN mrp NUMERIC(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'discount_percentage') THEN
    ALTER TABLE products ADD COLUMN discount_percentage NUMERIC(5,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_featured') THEN
    ALTER TABLE products ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_new_arrival') THEN
    ALTER TABLE products ADD COLUMN is_new_arrival BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_best_seller') THEN
    ALTER TABLE products ADD COLUMN is_best_seller BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_trending') THEN
    ALTER TABLE products ADD COLUMN is_trending BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'prompt_override') THEN
    ALTER TABLE products ADD COLUMN prompt_override TEXT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_products_gender ON products(gender);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- 5. Product AI Reference Assets
CREATE TABLE IF NOT EXISTS product_ai_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  asset_type    TEXT NOT NULL CHECK (asset_type IN ('front', 'side', 'back', 'closeup', 'alternate', 'mask')),
  url           TEXT NOT NULL,
  alt_text      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.product_ai_assets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_product_ai_assets_product ON product_ai_assets(product_id);

-- 6. Product Version History
CREATE TABLE IF NOT EXISTS product_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID REFERENCES products(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot_data  JSONB NOT NULL,
  changed_by     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  change_summary TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.product_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_product_versions_product ON product_versions(product_id);

-- 7. Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 8. Seed Men Categories & Collections
INSERT INTO collections (name, slug, description, display_order) VALUES
  ('Women Summer Collection', 'women-summer-collection', 'Lightweight breathable styles for warm seasons.', 1),
  ('Premium Toppers', 'premium-toppers', 'High-density natural crown toppers.', 2),
  ('Men Essentials', 'men-essentials', 'Natural hairline systems and patches for men.', 3),
  ('New Arrivals', 'new-arrivals', 'Latest released products and AI try-on models.', 4)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, description, gender, display_order) VALUES
  ('Hair Systems (Men)', 'men-hair-systems', 'Full-cap breathable French lace hair systems for men.', 'men', 10),
  ('Hair Patches (Men)', 'men-hair-patches', 'Targeted frontal and crown patches for male baldness patterns.', 'men', 11),
  ('Wigs (Men)', 'men-wigs', 'Natural human hair full wigs for men.', 'men', 12)
ON CONFLICT (slug) DO NOTHING;

-- Seed Sample Men Products
INSERT INTO products (category_id, name, slug, description, sku, price, selling_price, mrp, image_url, gender, status, display_order, is_featured, is_trending) VALUES
  (
    (SELECT id FROM categories WHERE slug = 'men-hair-systems'),
    'French Lace Miracle System (Men)',
    'french-lace-miracle-system-men',
    'Invisible hairline ultra-breathable French lace hair system for men. 100% human hair.',
    'HO-MEN-SYS-01',
    24999.00,
    24999.00,
    29999.00,
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
    'men',
    'published',
    1,
    true,
    true
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hair-patches'),
    'Frontal Hairline Patch (Men)',
    'frontal-hairline-patch-men',
    'Targeted receding hairline correction patch with skin base.',
    'HO-MEN-PTCH-01',
    12999.00,
    12999.00,
    15999.00,
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
    'men',
    'published',
    2,
    false,
    true
  )
ON CONFLICT (slug) DO NOTHING;
