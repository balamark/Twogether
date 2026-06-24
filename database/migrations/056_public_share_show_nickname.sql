-- Per-user preference for how they appear when a couple shares a 衝突事件 / 我們的牆
-- thread into the public 公開問答. Default TRUE = show the user's nickname (it's a
-- nickname, not a real name, and the AI counselor already references it). When
-- FALSE, that user is rendered as 匿名 A / 匿名 B in public shares.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_share_show_nickname BOOLEAN NOT NULL DEFAULT TRUE;
