-- Indexes for the 親密邀請紀錄 page (GET /api/intimacy-requests).
--
-- Why: that route filters `sender_id = $1 OR receiver_id = $1` (plus a COUNT
-- over the same filter) and sorts by created_at DESC. Only receiver_id had an
-- index (009), so the sender half of the OR — and the whole COUNT — scanned the
-- table, getting slower as every couple's invite history grows. With both
-- sides indexed on (user, created_at DESC) Postgres can BitmapOr the two and
-- read the newest page directly. The stats query (receiver_id + created_at /
-- responded_at window) also uses the receiver index.

CREATE INDEX IF NOT EXISTS idx_intimacy_requests_sender_created
  ON intimacy_requests (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intimacy_requests_receiver_created
  ON intimacy_requests (receiver_id, created_at DESC);
