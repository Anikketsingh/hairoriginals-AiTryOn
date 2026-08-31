-- ============================================================
-- Raise the signed-in try-on quota from 5 to 10000 — for EXISTING
-- users as well as new ones.
--
-- Changing settings.registered_bonus_generations alone only affects
-- new signups: app/api/auth/complete/route.ts grants the bonus once
-- per user (the `isNewRegistration` guard on an existing
-- source='registered_bonus' row), so anyone who already signed up
-- keeps their old amount=5 ledger row forever.
--
-- getCreditBalance() sums (amount - consumed) across a user's rows,
-- so topping up the existing row's `amount` restores the balance
-- without touching what they've already spent.
--
-- Guest quota (guest_free_generations) is intentionally left at 1.
-- ============================================================

-- 1. The config value, for all future signups.
--    Seeded with ON CONFLICT DO NOTHING in 20260629000001, so this
--    must be an UPDATE, not a re-INSERT.
UPDATE settings
SET value = '10000', updated_at = NOW()
WHERE key = 'registered_bonus_generations';

-- 2. Backfill every user who already has their signup bonus.
--    GREATEST() so nobody who somehow holds more is cut back down.
UPDATE generation_credits
SET amount = GREATEST(amount, 10000)
WHERE source = 'registered_bonus'
  AND user_id IS NOT NULL;

-- 3. Edge case: a registered user with no registered_bonus row at all
--    (signed up before the grant existed, or the grant insert failed).
--    Give them the same quota so no account is left behind.
INSERT INTO generation_credits (user_id, source, amount, consumed)
SELECT u.id, 'registered_bonus', 10000, 0
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM generation_credits gc
  WHERE gc.user_id = u.id
    AND gc.source = 'registered_bonus'
);

-- 4. Gate copy still promised "5 more free try-ons".
UPDATE settings
SET value = '"Loved how that looked? Sign in to unlock unlimited free try-ons."',
    updated_at = NOW()
WHERE key = 'login_gate_message';
