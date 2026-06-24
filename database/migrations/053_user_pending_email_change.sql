-- Pending login-email change.
--
-- Lets a user change the email they sign in with, but only after they prove
-- they own the new address. We DON'T touch users.email when the change is
-- requested: the new address is parked in pending_email until the user clicks
-- the confirmation link we send to it. This mirrors the soft email-verification
-- flow (migration 049) and means a typo can never lock anyone out of their
-- account — login keeps working on the old address until the swap is confirmed.

ALTER TABLE users
  -- The new address awaiting confirmation. NULL when no change is in flight.
  ADD COLUMN IF NOT EXISTS pending_email TEXT,
  -- One-shot token embedded in the confirmation link; cleared once used.
  ADD COLUMN IF NOT EXISTS pending_email_token TEXT,
  -- When the latest confirmation email was sent (used to rate-limit resends).
  ADD COLUMN IF NOT EXISTS pending_email_sent_at TIMESTAMP WITH TIME ZONE;

-- Token lookups must be fast and only match the (at most one) row mid-flow.
CREATE INDEX IF NOT EXISTS idx_users_pending_email_token
  ON users(pending_email_token)
  WHERE pending_email_token IS NOT NULL;
