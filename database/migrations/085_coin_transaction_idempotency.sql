-- Idempotency for coin transactions.
--
-- POST /coins/transaction inserted a fresh row on every call, so a retried or
-- double-submitted request (e.g. the ForeplayView "try activity" reward buttons
-- firing twice, or a timeout that actually succeeded then got retried) granted
-- the coins more than once. That forced the frontend to block the button for
-- the whole round-trip as the only guard. With a client-supplied idempotency
-- key the server can dedupe instead, letting the UI credit optimistically and
-- respond instantly.
--
-- The key is optional (nullable) so existing callers and rows are unaffected;
-- the uniqueness is enforced only when a key is present, via a partial unique
-- index. Keys are client-generated UUIDs, unique per user intent.
ALTER TABLE coin_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_transactions_idempotency_key
  ON coin_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
