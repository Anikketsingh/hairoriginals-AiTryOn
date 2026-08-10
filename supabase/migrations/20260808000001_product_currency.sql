-- Adds an explicit currency to products.
--
-- Until now no currency column existed anywhere: prices were bare NUMERIC and
-- every render site prepended a literal '₹'. That made INR an unstated
-- assumption baked into the UI rather than the data, so a non-INR price was
-- simply unrepresentable — it would render as rupees no matter what.
--
-- Defaulting to INR backfills every existing row correctly, since all current
-- catalog prices are rupee-denominated.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

-- ISO 4217 codes are exactly three uppercase letters. Guards against the
-- symbols and lowercase codes that inevitably get typed into an admin form.
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_currency_iso4217;
ALTER TABLE products
  ADD CONSTRAINT products_currency_iso4217 CHECK (currency ~ '^[A-Z]{3}$');

COMMENT ON COLUMN products.currency IS
  'ISO 4217 code the price/selling_price/mrp columns are denominated in. Amounts are stored in MAJOR units (rupees, dollars), not minor units.';

-- 'MRP' (Maximum Retail Price) is an India-specific concept from the Legal
-- Metrology Act with no meaning in the US/EU, where the equivalent is an
-- advisory compare-at / RRP figure. The column keeps its name to avoid a
-- breaking rename, but its semantics are documented as compare-at so the
-- global UI can label it correctly per market.
COMMENT ON COLUMN products.mrp IS
  'Compare-at price (struck-through reference price). In India this is the legally-defined MRP; elsewhere treat it as RRP/compare-at.';
