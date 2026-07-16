-- ============================================================
-- Men's Catalog Seed: Hair Patches (HairOriginals types) + Hairstyles
-- ============================================================
-- Seeds the six HairOriginals men's hair patch types
-- (https://www.hairoriginals.com/products/men-patches-100-human-hair)
-- and a new "Hairstyles (Men)" category with AI try-on styles.
-- Images live in the public "products" storage bucket under
-- product-images/ (uploaded to the hosted project; URLs are absolute
-- so they resolve from local dev too). Idempotent via ON CONFLICT.
-- ============================================================

-- 1. Hairstyles (Men) category
INSERT INTO categories (name, slug, description, gender, display_order) VALUES
  ('Hairstyles (Men)', 'men-hairstyles', 'Classic and trending men''s hairstyles to try on instantly with AI.', 'men', 13)
ON CONFLICT (slug) DO NOTHING;

-- 2. Men's hair patch products (one per HairOriginals patch type)
INSERT INTO products (
  category_id, name, slug, description, short_description, sku,
  price, selling_price, mrp, discount_percentage, image_url, shop_url,
  gender, brand, status, hair_type, hair_color, base_material,
  installation_type, recommended_for, is_active, display_order,
  is_featured, is_new_arrival, is_best_seller, is_trending
) VALUES
  (
    (SELECT id FROM categories WHERE slug = 'men-hair-patches'),
    'Mono Hair Patch (Men)', 'mono-hair-patch-men',
    'Monofilament base hair patch made from 100% human hair. The tightly woven mono mesh gives a natural scalp-like parting, superior durability, and all-day breathability — ideal for first-time users and daily wear.',
    'Durable breathable mono base for daily, long-term wear.',
    'HO-MEN-PTCH-MONO', 11999.00, 11999.00, 14999.00, 20,
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/mono-hair-patch-men.jpg',
    'https://www.hairoriginals.com/products/men-patches-100-human-hair?variant=55269727273251',
    'men', 'HairOriginals', 'published', 'Straight', 'Natural Black',
    'Monofilament base', 'Clip / Tape / Glue', 'Full crown coverage and everyday use',
    true, 1, false, false, false, false
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hair-patches'),
    'Australian Hair Patch (Men)', 'australian-hair-patch-men',
    'Australian lace hair patch in 100% human hair. Feather-light, highly breathable base that stays secure through workouts, swimming, and humid weather while staying invisible from every angle.',
    'Feather-light Australian lace — sweat and swim friendly.',
    'HO-MEN-PTCH-AUS', 14999.00, 14999.00, 17999.00, 17,
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/australian-hair-patch-men.jpg',
    'https://www.hairoriginals.com/products/men-patches-100-human-hair?variant=55269731172643',
    'men', 'HairOriginals', 'published', 'Straight', 'Natural Black',
    'Australian lace with PU perimeter', 'Clip / Tape / Glue', 'Active lifestyles and hot climates',
    true, 2, false, false, true, false
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hair-patches'),
    'Mirage Hair Patch (Men)', 'mirage-hair-patch-men',
    'Mirage ultra-thin skin hair patch with 100% human hair. The 0.06mm poly-skin base disappears against the scalp for a completely undetectable hairline, even at close distance.',
    'Ultra-thin skin base that melts into your scalp.',
    'HO-MEN-PTCH-MIR', 16999.00, 16999.00, 19999.00, 15,
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/mirage-hair-patch-men.jpg',
    'https://www.hairoriginals.com/products/men-patches-100-human-hair?variant=55269731205411',
    'men', 'HairOriginals', 'published', 'Straight', 'Natural Black',
    'Ultra-thin skin (0.06mm PU)', 'Clip / Tape / Glue', 'Undetectable finish and clean hairlines',
    true, 3, false, false, false, true
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hair-patches'),
    'Premium Silk Mirage Hair Patch (Men)', 'premium-silk-mirage-hair-patch-men',
    'Our flagship Premium Silk Mirage patch pairs a silk-top base with an ultra-thin skin perimeter, so every strand appears to grow directly from your scalp. Maximum realism, premium density, 100% human hair.',
    'Flagship silk-top base — the most realistic scalp illusion.',
    'HO-MEN-PTCH-PSM', 19999.00, 19999.00, 24999.00, 20,
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/premium-silk-mirage-hair-patch-men.jpg',
    'https://www.hairoriginals.com/products/men-patches-100-human-hair?variant=55269731238179',
    'men', 'HairOriginals', 'published', 'Straight', 'Natural Black',
    'Silk top with ultra-thin skin', 'Clip / Tape / Glue', 'The most natural look money can buy',
    true, 4, true, false, true, false
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hair-patches'),
    'Los Angeles Hair Patch (Men)', 'los-angeles-hair-patch-men',
    'Los Angeles hair patch with a French lace front and PU sides. Delivers the soft, feathered ''Hollywood'' hairline favoured by stylists, with easy attachment and a secure everyday hold. 100% human hair.',
    'Hollywood-style feathered front hairline.',
    'HO-MEN-PTCH-LA', 17999.00, 17999.00, 21999.00, 18,
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/los-angeles-hair-patch-men.jpg',
    'https://www.hairoriginals.com/products/men-patches-100-human-hair?variant=55269731270947',
    'men', 'HairOriginals', 'published', 'Straight', 'Natural Black',
    'French lace front with PU sides', 'Clip / Tape / Glue', 'Style-forward looks and soft hairlines',
    true, 5, false, false, false, false
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hair-patches'),
    'Frontline Hair Patch (Men)', 'frontline-hair-patch-men',
    'Frontline patch designed specifically for receding or M-shaped hairlines. Restores the frontal zone with a Swiss lace base that blends invisibly into your existing hair. 100% human hair.',
    'Targeted patch for receding front hairlines.',
    'HO-MEN-PTCH-FRL', 12999.00, 12999.00, 15999.00, 19,
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/frontline-hair-patch-men.jpg',
    'https://www.hairoriginals.com/products/men-patches-100-human-hair?variant=55269731303715',
    'men', 'HairOriginals', 'published', 'Straight', 'Natural Black',
    'Swiss lace front', 'Clip / Tape / Glue', 'Receding hairline and frontal thinning',
    true, 6, false, true, false, false
  )
ON CONFLICT (slug) DO NOTHING;

-- 3. Men's hairstyles (AI try-on looks; no price — the UI shows "Free to try")
INSERT INTO products (
  category_id, name, slug, description, short_description, sku,
  image_url, gender, brand, status, hair_type, is_active, display_order
) VALUES
  (
    (SELECT id FROM categories WHERE slug = 'men-hairstyles'),
    'Classic Side Part', 'classic-side-part-men',
    'Timeless side-parted style with a clean taper. Try it on your own photo with AI before committing to the look.',
    'Timeless side-parted style with a clean taper.', 'HO-MEN-STY-01',
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/classic-side-part-men.jpg',
    'men', 'HairOriginals', 'published', 'Straight', true, 1
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hairstyles'),
    'Executive Slick Back', 'executive-slick-back-men',
    'Polished slicked-back look for formal settings. Try it on your own photo with AI before committing to the look.',
    'Polished slicked-back look for formal settings.', 'HO-MEN-STY-02',
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/executive-slick-back-men.jpg',
    'men', 'HairOriginals', 'published', 'Straight', true, 2
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hairstyles'),
    'Short Textured Crop', 'short-textured-crop-men',
    'Low-maintenance short crop with subtle texture. Try it on your own photo with AI before committing to the look.',
    'Low-maintenance short crop with subtle texture.', 'HO-MEN-STY-03',
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/short-textured-crop-men.jpg',
    'men', 'HairOriginals', 'published', 'Straight', true, 3
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hairstyles'),
    'Medium Wavy Flow', 'medium-wavy-flow-men',
    'Relaxed medium-length waves with natural flow. Try it on your own photo with AI before committing to the look.',
    'Relaxed medium-length waves with natural flow.', 'HO-MEN-STY-04',
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/medium-wavy-flow-men.jpg',
    'men', 'HairOriginals', 'published', 'Wavy', true, 4
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hairstyles'),
    'Natural Curly Top', 'natural-curly-top-men',
    'Effortless curls up top with a neat finish. Try it on your own photo with AI before committing to the look.',
    'Effortless curls up top with a neat finish.', 'HO-MEN-STY-05',
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/natural-curly-top-men.jpg',
    'men', 'HairOriginals', 'published', 'Curly', true, 5
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hairstyles'),
    'Long Natural Curls', 'long-natural-curls-men',
    'Shoulder-length natural curls with full volume. Try it on your own photo with AI before committing to the look.',
    'Shoulder-length natural curls with full volume.', 'HO-MEN-STY-06',
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/long-natural-curls-men.jpg',
    'men', 'HairOriginals', 'published', 'Curly', true, 6
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hairstyles'),
    'Short Afro Fade', 'short-afro-fade-men',
    'Tight afro curls with a sharp modern fade. Try it on your own photo with AI before committing to the look.',
    'Tight afro curls with a sharp modern fade.', 'HO-MEN-STY-07',
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/short-afro-fade-men.jpg',
    'men', 'HairOriginals', 'published', 'Coily', true, 7
  ),
  (
    (SELECT id FROM categories WHERE slug = 'men-hairstyles'),
    'Sponge Twists', 'sponge-twists-men',
    'Defined sponge twists with a tapered edge-up. Try it on your own photo with AI before committing to the look.',
    'Defined sponge twists with a tapered edge-up.', 'HO-MEN-STY-08',
    'https://kvlwtouwwhxmqijohnjb.supabase.co/storage/v1/object/public/products/product-images/sponge-twists-men.jpg',
    'men', 'HairOriginals', 'published', 'Coily', true, 8
  )
ON CONFLICT (slug) DO NOTHING;
