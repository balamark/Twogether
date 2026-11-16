-- 親密記錄・感受小調查 (love moment check-ins)
--
-- Why: a love moment says THAT it happened, never how it felt. Two hours after
-- one partner logs a moment, Twogether asks the OTHER half a 10-second
-- question: how was it, what did you like (worth doing again), and was the
-- timing right (same time next time?). The answers feed the 滿意度 / 最喜歡 /
-- 最佳時段 stats on the calendar, so the couple learns what works for them.
--
-- One row per (moment, person asked). The row is created when the moment is
-- recorded (due_at = created_at + 2h) and doubles as the delivery queue: there
-- is no cron in this app, so lib/momentCheckins.js sweeps rows whose due_at has
-- passed off busy GET endpoints, claims them by setting notified_at, and writes
-- the in-app notification + LINE push.
--
-- `liked` stores KEYS ('atmosphere', 'foreplay', …) and `timing` a key
-- ('perfect', 'earlier', …) — the whitelist + labels live in
-- lib/momentCheckins.js and src/components/MomentCheckinCard.tsx, not in a
-- CHECK, so a new chip doesn't need a migration.

CREATE TABLE IF NOT EXISTS love_moment_checkins (
  moment_id    UUID NOT NULL REFERENCES love_moments(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_at       TIMESTAMP WITH TIME ZONE NOT NULL,
  notified_at  TIMESTAMP WITH TIME ZONE,
  answered_at  TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  satisfaction SMALLINT CHECK (satisfaction BETWEEN 1 AND 5),
  liked        TEXT[] NOT NULL DEFAULT '{}',
  timing       VARCHAR(16),
  note         VARCHAR(80),
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (moment_id, user_id)
);

-- The sweep's only query shape: due, never delivered, still open.
CREATE INDEX IF NOT EXISTS idx_love_moment_checkins_due
  ON love_moment_checkins (due_at)
  WHERE notified_at IS NULL AND answered_at IS NULL AND dismissed_at IS NULL;

ALTER TABLE public.love_moment_checkins ENABLE ROW LEVEL SECURITY;
