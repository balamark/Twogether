-- 存款：each partner has their own deposit account that only the OTHER
-- partner can pay into, replacing the couple-wide coin pool that the app
-- credited automatically (records, scripts, games, accepted invites).
--
-- Every row is now one of three kinds, all owned by one partner's account:
--   thanks  – the partner deposits into owner's account ("謝謝你…") → confirmed
--   request – owner asks the partner for a deposit           → pending until the partner confirms
--   redeem  – owner spends on a gift from the shop            → pending until the partner agrees
-- Only `confirmed` rows count toward a balance; a pending redeem reserves its
-- amount so one balance can't back two redemptions at once.
--
-- Product decision (2026-10-29): every existing balance is reset to zero.
-- All accounts so far are testers, and the old rows were auto-granted coins
-- that have no owner/depositor, so they can't be mapped onto the new model.

DELETE FROM coin_transactions;

ALTER TABLE coin_transactions
  ADD COLUMN IF NOT EXISTS owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS gift_icon VARCHAR(10),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_kind_valid;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_kind_valid
  CHECK (kind IN ('thanks', 'request', 'redeem'));

ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_status_valid;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_status_valid
  CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled'));

-- Deposits earn, redemptions spend — keeps transaction_type consistent for
-- the balance sums in stats/achievements.
ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_kind_type_match;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_kind_type_match
  CHECK ((kind = 'redeem') = (transaction_type = 'spend'));

ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_amount_positive;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_amount_positive
  CHECK (amount > 0);

-- A thanks deposit always comes from the partner, never from the owner.
ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_thanks_from_partner;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_thanks_from_partner
  CHECK (kind <> 'thanks' OR created_by <> owner_id);

CREATE INDEX IF NOT EXISTS idx_coin_transactions_owner_status
  ON coin_transactions (owner_id, status);

CREATE INDEX IF NOT EXISTS idx_coin_transactions_couple_date
  ON coin_transactions (couple_id, transaction_date DESC);
