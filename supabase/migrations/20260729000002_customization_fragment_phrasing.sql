-- ============================================================
-- Customization prompt fragments: modifier phrasing
-- ============================================================
-- The fragments seeded in 20260729000001 were standalone imperatives
-- ("Render the hair in a deep, glossy jet black."). Appended as the final
-- lines of the Gemini prompt they read as a fresh instruction with no
-- subject, and with two images in context the model would sometimes apply
-- them to the style reference and return a recoloured Image 2 instead of
-- the customer's photo.
--
-- composeCustomizedPrompt (lib/customization.ts) now anchors the whole
-- block to Image 1, which is the actual fix. These rewrites make each
-- fragment a modifier of "the applied hair" rather than a command in its
-- own right — a second line of defence, and a better template for admins
-- writing new options.
--
-- Only rows still carrying the exact original seed text are updated, so any
-- fragment an admin has already edited by hand is left untouched.

UPDATE customization_options o
SET prompt_fragment = v.new_fragment
FROM (VALUES
  ('jet_black',
   'Render the hair in a deep, glossy jet black.',
   'Colour the applied hair a deep, glossy jet black.'),
  ('natural_brown',
   'Render the hair in a warm, natural chestnut brown.',
   'Colour the applied hair a warm, natural chestnut brown.'),
  ('chestnut',
   'Render the hair in a rich chestnut brown with subtle auburn highlights.',
   'Colour the applied hair a rich chestnut brown with subtle auburn highlights.'),
  ('ash_blonde',
   'Render the hair in a cool-toned ash blonde.',
   'Colour the applied hair a cool-toned ash blonde.'),
  ('silver_grey',
   'Render the hair in a soft, natural silver-grey.',
   'Colour the applied hair a soft, natural silver-grey.'),
  ('short',
   'Trim the hairstyle to a short length, above the shoulders.',
   'Make the applied hair short, ending above the shoulders.'),
  ('medium',
   'Keep the hairstyle at a medium length, around the shoulders.',
   'Make the applied hair medium length, ending around the shoulders.'),
  ('long',
   'Extend the hairstyle to a long length, well past the shoulders.',
   'Make the applied hair long, falling well past the shoulders.')
) AS v(value, old_fragment, new_fragment)
WHERE o.value = v.value
  AND o.prompt_fragment = v.old_fragment;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
