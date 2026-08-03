-- ============================================================
-- Enforce try-on trial limits: 1 free (guest) + 5 more (signed-in)
--
-- The Phase 1 credits ledger + consume_one_credit() were already correct,
-- but lib/funnel.ts's getFunnelStage() short-circuited to "unlimited" for
-- any signed-in user (return 2 unconditionally), so registered_bonus and
-- agent_grant credits were never actually spent. This migration only
-- updates the funnel numbers/copy to match the corrected 1 + 5 = 6
-- lifetime cap now enforced in app/api/generate/route.ts, and adds the
-- refund counterpart to consume_one_credit for generations that fail
-- after a credit was already debited.
-- ============================================================

-- registered_bonus_generations was seeded at 2 (context.md's original "2
-- more") with ON CONFLICT DO NOTHING, so a plain re-INSERT would not apply
-- the new value — this must be an UPDATE.
UPDATE settings
SET value = '5', updated_at = NOW()
WHERE key = 'registered_bonus_generations';

-- Gate copy referenced the old "2 more" number.
UPDATE settings
SET value = '"Loved how that looked? Sign in to unlock 5 more free try-ons."',
    updated_at = NOW()
WHERE key = 'login_gate_message';

-- ──────────────────────────────────────────────────────────────
-- ATOMIC CREDIT REFUND FUNCTION
-- Counterpart to consume_one_credit (20260629000003) — restores one unit
-- of consumption on a specific credit row when a generation fails after
-- the credit was already debited. Guarded so it can never push consumed
-- below 0 (e.g. a duplicate refund from a retried reconciler).
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION release_one_credit(
  p_credit_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE generation_credits
  SET consumed = consumed - 1
  WHERE id = p_credit_id
    AND consumed > 0;
END;
$$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
