-- "關係之屋" cultivation system: periodic relationship check-ins (each partner
-- rates the two pillars 信賴/Trust + 奉獻/Commitment, plus 連結/Connection) and a
-- small reminder dedup log so the in-app/email nudges fire at most once per
-- cooldown (there is no server cron — reminders are evaluated when the app calls
-- GET /api/relationship/summary).

CREATE TABLE IF NOT EXISTS relationship_checkins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id   UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trust       SMALLINT NOT NULL,
  commitment  SMALLINT NOT NULL,
  connection  SMALLINT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT relationship_checkins_scale CHECK (
    trust BETWEEN 1 AND 5 AND commitment BETWEEN 1 AND 5 AND connection BETWEEN 1 AND 5
  )
);

CREATE INDEX IF NOT EXISTS idx_relationship_checkins_couple
  ON relationship_checkins(couple_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_relationship_checkins_user
  ON relationship_checkins(user_id, created_at DESC);

-- One row per (user, reminder kind); upserted when a reminder is delivered so we
-- can enforce a per-kind cooldown.
CREATE TABLE IF NOT EXISTS relationship_reminder_log (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        VARCHAR(32) NOT NULL,
  last_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind)
);
