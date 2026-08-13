-- ──────────────────────────────────────────────────────────────
-- MAINTENANCE MODE
--
-- Site-wide kill switch for the customer surface. Flipping `maintenance_mode`
-- to true makes every /(customer) page and every customer-facing API route
-- return the maintenance screen / a 503; /admin and /api/admin stay up so the
-- switch can be flipped back off.
--
-- Lives in `settings` rather than an env var so it can be toggled without a
-- redeploy. The *authority to toggle it* is still an env secret
-- (MAINTENANCE_PASSWORD) — see lib/maintenance.ts.
-- ──────────────────────────────────────────────────────────────

INSERT INTO settings (key, value, description) VALUES
  ('maintenance_mode',
   'false',
   'Site-wide kill switch. When true the customer site is closed and shows maintenance_message. Toggled from Admin → AI Configuration, gated behind MAINTENANCE_PASSWORD.'),

  ('maintenance_message',
   '"We''re carrying out some quick maintenance and will be back shortly. Thanks for your patience!"',
   'Copy shown to visitors while maintenance_mode is true.')
ON CONFLICT (key) DO NOTHING;
