-- ============================================================
-- Phase C: Save custom (non-catalog) looks
-- ============================================================
-- saved_products can only hold catalog product_ids, so a generated look from a
-- user-uploaded ("custom") style photo had nowhere to be saved. The generation
-- row itself is the natural home — flag it directly.

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS is_saved BOOLEAN NOT NULL DEFAULT false;

-- Fast lookup of a session/user's saved looks.
CREATE INDEX IF NOT EXISTS idx_generations_is_saved
  ON generations(is_saved)
  WHERE is_saved = true;
