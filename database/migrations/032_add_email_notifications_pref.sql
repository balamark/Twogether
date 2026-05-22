-- Migration: per-user opt-out for partner-activity email notifications.
-- When FALSE, the backend skips sending emails triggered by the partner's
-- in-app actions (wall posts, events, intimacy responses, etc.). In-app
-- notifications are unaffected.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
