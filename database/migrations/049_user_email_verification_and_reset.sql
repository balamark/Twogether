-- Regular-user email verification + password reset.
--
-- Adds the columns the auth flow needs to (a) confirm a new user's email is
-- really theirs and (b) let users reset a forgotten password via a tokenised
-- link.
--
-- Verification is SOFT: users can use the app before verifying. To avoid
-- nagging people who signed up before this existed, every existing user is
-- grandfathered in as already-verified; only accounts created from now on
-- start unverified.

ALTER TABLE users
  -- Has the user confirmed their email via the link we send on sign-up?
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  -- One-shot token embedded in the verification link; cleared once used.
  ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
  -- When the latest verification email was sent (used to rate-limit resends).
  ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMP WITH TIME ZONE,
  -- Password-reset token + its expiry. Token is cleared once the password is
  -- changed; expiry keeps a stolen link from working forever.
  ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP WITH TIME ZONE;

-- Grandfather existing accounts so soft verification doesn't suddenly flag them.
-- Scoped to the rows that predate this migration: anything still on the column
-- default (false) with no pending token.
UPDATE users
   SET email_verified = true
 WHERE email_verified = false
   AND email_verification_token IS NULL;

-- Token lookups must be fast and only match the (at most one) row mid-flow.
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
  ON users(email_verification_token)
  WHERE email_verification_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
  ON users(password_reset_token)
  WHERE password_reset_token IS NOT NULL;
