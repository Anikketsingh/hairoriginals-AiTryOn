-- ============================================================
-- Phase 4: Prompt Library Schema & Seed Data
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PROMPT TEMPLATES (context.md §5.5)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  template      TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ──────────────────────────────────────────────────────────────
-- SEED DATA: Default Prompt Library Templates
-- ──────────────────────────────────────────────────────────────
INSERT INTO prompt_templates (name, slug, template, version) VALUES
  (
    'Default Try-On Prompt',
    'default',
    'You are an expert AI hairstylist for HairOriginals. You are given two images: 1) A portrait of a customer, and 2) A HairOriginals hair product (topper, extensions, or wig). Realistic photorealistic transformation: Seamlessly apply the hair product onto the customer while preserving their exact facial features, skin tone, background, and lighting.',
    1
  ),
  (
    'Hair Topper Prompt',
    'hair-topper',
    'Apply the HairOriginals crown topper to the top and crown area of the customer portrait. Ensure the hair texture and parting blend naturally with their existing frontal hairline.',
    1
  ),
  (
    'Hair Extensions Prompt',
    'hair-extension',
    'Add length and volume to the customer portrait using the HairOriginals extension product. Blend the layers seamlessly from root to tip.',
    1
  ),
  (
    'Wig Prompt',
    'wig',
    'Transform the customer portrait with the full HairOriginals wig. Retain facial geometry while fitting the natural hairline seamlessly.',
    1
  ),
  (
    'Fringe / Bangs Prompt',
    'fringe',
    'Attach the HairOriginals clip-in fringe to the forehead of the customer portrait. Ensure realistic face-framing and soft hair strands.',
    1
  )
ON CONFLICT (slug) DO NOTHING;

-- Seed default Super Admin user record in admin_users for testing
INSERT INTO admin_users (email, name, role, status) VALUES
  ('admin@hairoriginals.com', 'Super Admin', 'super_admin', 'active')
ON CONFLICT (email) DO NOTHING;
