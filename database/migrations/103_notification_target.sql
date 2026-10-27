-- Give notifications an optional pointer to the exact thing they're about, so
-- tapping one in 通知中心 lands ON it instead of just opening the tab:
--   target_id       – the wall post / love moment (記錄) the notification is about
--   target_reply_id – for wall_reply / wall_ai_comment, the reply inside that
--                     post's thread
-- TEXT rather than UUID so any future target (numeric ids included) fits.
-- Nullable: existing rows and types without a target simply leave it NULL and
-- fall back to opening the tab, as before.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS target_id TEXT,
  ADD COLUMN IF NOT EXISTS target_reply_id TEXT;
