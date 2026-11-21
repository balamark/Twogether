-- Sign out every existing session when a password changes.
--
-- Why: logins are stateless JWTs that live for JWT_EXPIRES_IN (7 days). Before
-- this column, resetting a password did not touch tokens already issued, so
-- someone who had got into the account kept access for up to a week after the
-- owner "locked them out". middleware/auth.js now rejects any token whose iat
-- (issued-at, seconds) is older than password_changed_at with
-- error_code TOKEN_REVOKED. NULL = never changed, every token stays valid.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
