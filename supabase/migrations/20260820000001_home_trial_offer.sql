-- ──────────────────────────────────────────────────────────────
-- HOME TRIAL OFFER
--
-- The route from an AI try-on result to the storefront's "try at home" booking
-- page — a stylist visits with the real product. Two surfaces on the result
-- screen: a permanent inline card, and a popup whose timing and frequency are
-- entirely admin-driven (see shouldShowPopup in lib/home-trial.ts).
--
-- Lives in `settings` rather than env vars or hardcoded copy because marketing
-- owns the creative, the copy and the timing, and needs to change all three
-- without a deploy (context.md §2.3, §5.6). Read via getHomeTrialConfig() in
-- lib/settings.ts and served to the browser by GET /api/home-trial.
--
-- Note the two image slots. The launch creative is women-specific (female
-- model, "Hair Extensions", a topper), so showing it to a man browsing patches
-- would read as a bug. `home_trial_image_men` is seeded empty and falls back to
-- the women artwork until a men's banner is uploaded from the admin panel.
-- ──────────────────────────────────────────────────────────────

INSERT INTO settings (key, value, description) VALUES

  ('home_trial_enabled',
   'true',
   'Master switch for the home trial offer. False removes both the inline result-screen card and the popup.'),

  ('home_trial_popup_enabled',
   'true',
   'Controls only the timed popup. False keeps the inline card but stops the sheet from ever auto-opening.'),

  ('home_trial_url',
   '"https://www.hairoriginals.com/pages/try-at-home-new"',
   'Booking page opened in a new tab. UTM params are appended client-side unless already present here.'),

  ('home_trial_image_women',
   '"/home-trial-banner.jpg"',
   'Banner creative shown to customers on the women catalogue. A path under public/, or an uploaded Storage URL.'),

  ('home_trial_image_men',
   '""',
   'Banner creative for the men catalogue. Empty falls back to home_trial_image_women.'),

  ('home_trial_cta_label',
   '"Book a home trial"',
   'Button and inline-card label. The home trial is a paid service — do not describe it as free.'),

  ('home_trial_subtext',
   '"A stylist brings the hair to you — try it on before you buy."',
   'One supporting line under the CTA label.'),

  ('home_trial_badge',
   '"At home"',
   'Short pill above the CTA on the inline result-screen card. Empty string hides it.'),

  ('home_trial_audience',
   '"all"',
   'Who sees the offer: all | women | men. Matched against the customer''s Women/Men catalogue toggle.'),

  ('home_trial_min_tryons',
   '1',
   'Try-ons a customer must have completed on this device before the popup may fire. 1 means every result; raise it to keep the first N clean.'),

  ('home_trial_delay_ms',
   '4500',
   'Pause after the result renders before the popup opens, so the customer sees their own look first.'),

  ('home_trial_once_per_session',
   'false',
   'Cap the popup at one impression per browser session. False shows it after every result, subject to the other limits.'),

  ('home_trial_stop_after_booking',
   'true',
   'Stop showing the popup on a device once the customer has tapped through to the booking page. The inline card always remains.')

ON CONFLICT (key) DO NOTHING;
