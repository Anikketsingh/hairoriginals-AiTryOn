-- ============================================================
-- Hair Highlights customization attribute
-- ============================================================
-- Third customization attribute, alongside Hair Colour and Hair Length.
-- Pure data — no application code changes: CustomizeStep renders whatever
-- attributes /api/products/[id]/customization returns, and
-- composeCustomizedPrompt folds in whatever fragments come back.
--
-- Highlights are additive rather than a base-colour replacement, so the
-- fragments say "add ... through the applied hair" and explicitly keep the
-- base colour dominant. That lets a customer combine Hair Colour and Hair
-- Highlights on the same product without the two fragments fighting.
--
-- Seeds the library only. Which products offer copper vs. caramel is set
-- per product in Admin → Products → editor → Customization.

INSERT INTO customization_attributes (key, label, description, ui_type, display_order) VALUES
  ('hair_highlights', 'Hair Highlights',
   'Optional highlight tone blended through the applied hair.', 'swatch', 2)
ON CONFLICT (key) DO NOTHING;

INSERT INTO customization_options (attribute_id, value, label, swatch_hex, prompt_fragment, display_order)
SELECT a.id, v.value, v.label, v.swatch_hex, v.prompt_fragment, v.display_order
FROM customization_attributes a
JOIN (VALUES
  ('hair_highlights', 'copper', 'Copper', '#B87333',
   'Add soft copper highlights through the applied hair, concentrated on the mid-lengths and ends and blended so the base hair colour stays dominant.', 0),
  ('hair_highlights', 'caramel', 'Caramel', '#C68E53',
   'Add soft caramel highlights through the applied hair, concentrated on the mid-lengths and ends and blended so the base hair colour stays dominant.', 1)
) AS v(attribute_key, value, label, swatch_hex, prompt_fragment, display_order)
  ON v.attribute_key = a.key
ON CONFLICT (attribute_id, value) DO NOTHING;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
