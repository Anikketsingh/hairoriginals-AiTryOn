-- ============================================================
-- Product External Shop Link
-- ============================================================
-- Lets admins pin an explicit external product URL per product. When set,
-- "Shop this look" opens this URL instead of the computed
-- {STORE_URL}/products/{slug} fallback (see components/flow/ResultStep.tsx).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'shop_url'
  ) THEN
    ALTER TABLE products ADD COLUMN shop_url TEXT;
  END IF;
END;
$$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
