-- LINE 通知整合: mirror in-app notifications to a user's LINE via the
-- Messaging API. Users add the official account as a friend and bind their app
-- account by sending a one-time link code; push then respects a per-user
-- opt-in (default on once linked).

ALTER TABLE users ADD COLUMN IF NOT EXISTS line_user_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS line_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- One LINE account maps to at most one app user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_line_user_id
  ON users(line_user_id) WHERE line_user_id IS NOT NULL;

-- Short-lived binding codes: the user requests one in Settings, then sends it
-- to the official account; the webhook matches it to bind their LINE userId.
CREATE TABLE IF NOT EXISTS line_link_codes (
  code VARCHAR(12) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_line_link_codes_user ON line_link_codes(user_id);
