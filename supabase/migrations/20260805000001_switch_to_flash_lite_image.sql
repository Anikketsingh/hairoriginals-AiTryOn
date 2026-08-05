-- Switch the default generation model to Nano Banana 2 Lite.
--
-- gemini-3.1-flash-image was averaging slow enough on the try-on flow to bump
-- against GEMINI_CALL_TIMEOUT_MS (45s, lib/generation-queue.ts).
-- gemini-3.1-flash-lite-image is the same model family, ~4s typical vs ~4-6s,
-- and roughly half the cost per 1K image ($0.0336 vs $0.067). The API contract
-- is identical, so lib/gemini.ts needs no changes beyond the model id.
--
-- Guarded on the previous value so this is idempotent and so a deliberate
-- override made from Admin → AI Configuration is never stomped by a re-run.

UPDATE settings
SET
  value = '"gemini-3.1-flash-lite-image"',
  description = 'Gemini image model used in all generation calls via lib/gemini.ts. Must be one of ALLOWED_GEMINI_MODELS in lib/gemini-models.ts; switchable from Admin → AI Configuration.',
  updated_at = NOW()
WHERE key = 'gemini_model'
  AND value = '"gemini-3.1-flash-image"';
