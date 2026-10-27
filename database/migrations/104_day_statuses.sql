-- 每日狀態 — one-tap mood + intimacy intention per person per day.
--
-- Why: the 親密節奏 calendar only shows a cycle-based estimate. This lets each
-- person say how they actually feel on a given day, so partners talk about it
-- instead of reading anything into a predicted date.
--
-- Private by default: `sharing_enabled` starts FALSE and only the owner can flip
-- it. A partner can read a row only while it's shared, and can never write it
-- (every write is keyed by the token's user_id).
--
-- `mood` / `intimacy_intention` store KEYS ('great', 'want_intimacy' …), never
-- labels, so copy can change without a migration. The whitelists live in
-- routes/day-status.js. Clearing both fields deletes the row — "not recorded"
-- is the absence of a row, never a value meaning "no".

CREATE TABLE IF NOT EXISTS day_statuses (
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status_date        DATE NOT NULL,
  mood               VARCHAR(16),
  intimacy_intention VARCHAR(24),
  sharing_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, status_date),
  CONSTRAINT day_statuses_not_empty
    CHECK (mood IS NOT NULL OR intimacy_intention IS NOT NULL)
);

-- New tables opt in to RLS themselves (see 063 / 086).
ALTER TABLE day_statuses ENABLE ROW LEVEL SECURITY;
