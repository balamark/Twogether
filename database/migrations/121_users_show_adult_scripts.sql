-- Per-user opt-in for 18+ role scripts in the creator marketplace.
-- Default false for every existing and new account. The marketplace list,
-- search, and direct script links hide those scripts until this is true.
-- The author's own 我的劇本 list is not filtered by this column.
--
-- No new table, so no new RLS statement: users already has row level
-- security. This only adds a column.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS show_adult_scripts BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.show_adult_scripts IS
  'When true, the creator marketplace shows scripts tagged 18+ or explicit/intense. Default false.';
