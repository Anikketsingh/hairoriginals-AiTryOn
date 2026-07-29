-- ============================================================
-- Per-Product Hair Customization (Colour & Length)
-- ============================================================
-- Generic attribute → option → product model so future attributes
-- (density, texture, volume, parting style, ...) are pure admin-panel
-- config — no migration or code change required.
--
-- Every existing product resolves to zero attached options (no seeded
-- product_customization_options rows, customization_enabled defaults to
-- false), so the customer-facing customize step never mounts for them.

-- ──────────────────────────────────────────────────────────────
-- CUSTOMIZATION ATTRIBUTES ("Hair Colour", "Hair Length", ...)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customization_attributes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT UNIQUE NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT,
  ui_type       TEXT NOT NULL DEFAULT 'chip'
                  CHECK (ui_type IN ('swatch', 'chip', 'thumbnail')),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customization_attributes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_customization_attributes_updated_at
  BEFORE UPDATE ON customization_attributes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────
-- CUSTOMIZATION OPTIONS — the shared library. prompt_fragment is the
-- only thing that ever reaches Gemini; it must never be exposed on a
-- public/customer-facing endpoint.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customization_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id    UUID NOT NULL REFERENCES customization_attributes(id) ON DELETE CASCADE,
  value           TEXT NOT NULL,
  label           TEXT NOT NULL,
  swatch_hex      TEXT,
  image_url       TEXT,
  prompt_fragment TEXT NOT NULL,
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customization_options_unique_value UNIQUE (attribute_id, value)
);

ALTER TABLE public.customization_options ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_customization_options_updated_at
  BEFORE UPDATE ON customization_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_customization_options_attribute
  ON customization_options(attribute_id);

-- ──────────────────────────────────────────────────────────────
-- PRODUCT ↔ OPTION ATTACHMENT — absence of rows means the feature is
-- inert for that product, regardless of the enable flag below.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_customization_options (
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_id     UUID NOT NULL REFERENCES customization_options(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, option_id)
);

ALTER TABLE public.product_customization_options ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_product_customization_options_product
  ON product_customization_options(product_id);

-- ──────────────────────────────────────────────────────────────
-- Per-product master switch + per-generation snapshot
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'customization_enabled'
  ) THEN
    ALTER TABLE products ADD COLUMN customization_enabled BOOLEAN NOT NULL DEFAULT false;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generations' AND column_name = 'customizations'
  ) THEN
    -- Snapshot of the resolved attribute/option selections at generation
    -- time (not FKs) so later admin edits or deletions never rewrite
    -- history. NULL when no customization was applied.
    ALTER TABLE generations ADD COLUMN customizations JSONB;
  END IF;
END;
$$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ──────────────────────────────────────────────────────────────
-- SEED: starter attribute + option library. No product attachments —
-- every existing product stays inert until an admin opts it in.
-- ──────────────────────────────────────────────────────────────
INSERT INTO customization_attributes (key, label, description, ui_type, display_order) VALUES
  ('hair_colour', 'Hair Colour', 'Recolour the applied hairstyle.', 'swatch', 0),
  ('hair_length', 'Hair Length', 'Adjust the length of the applied hairstyle.', 'chip', 1)
ON CONFLICT (key) DO NOTHING;

INSERT INTO customization_options (attribute_id, value, label, swatch_hex, prompt_fragment, display_order)
SELECT a.id, v.value, v.label, v.swatch_hex, v.prompt_fragment, v.display_order
FROM customization_attributes a
JOIN (VALUES
  ('hair_colour', 'jet_black',    'Jet Black',    '#0A0A0A', 'Render the hair in a deep, glossy jet black.', 0),
  ('hair_colour', 'natural_brown','Natural Brown','#4A2E1E', 'Render the hair in a warm, natural chestnut brown.', 1),
  ('hair_colour', 'chestnut',     'Chestnut',     '#6B3A1F', 'Render the hair in a rich chestnut brown with subtle auburn highlights.', 2),
  ('hair_colour', 'ash_blonde',   'Ash Blonde',   '#B7A98F', 'Render the hair in a cool-toned ash blonde.', 3),
  ('hair_colour', 'silver_grey',  'Silver Grey',  '#B8B8B8', 'Render the hair in a soft, natural silver-grey.', 4)
) AS v(attribute_key, value, label, swatch_hex, prompt_fragment, display_order)
  ON v.attribute_key = a.key
ON CONFLICT (attribute_id, value) DO NOTHING;

INSERT INTO customization_options (attribute_id, value, label, prompt_fragment, display_order)
SELECT a.id, v.value, v.label, v.prompt_fragment, v.display_order
FROM customization_attributes a
JOIN (VALUES
  ('hair_length', 'short',  'Short',  'Trim the hairstyle to a short length, above the shoulders.', 0),
  ('hair_length', 'medium', 'Medium', 'Keep the hairstyle at a medium length, around the shoulders.', 1),
  ('hair_length', 'long',   'Long',   'Extend the hairstyle to a long length, well past the shoulders.', 2)
) AS v(attribute_key, value, label, prompt_fragment, display_order)
  ON v.attribute_key = a.key
ON CONFLICT (attribute_id, value) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- SEED: global kill switch (Admin → AI Configuration)
-- ──────────────────────────────────────────────────────────────
INSERT INTO settings (key, value, description) VALUES
  ('customization_enabled', 'true',
   'Fleet-wide kill switch for Hair Colour / Hair Length customization — set false to disable for every product without a deploy.')
ON CONFLICT (key) DO NOTHING;
