-- "婚姻檢查" (Marriage Check-up): a periodic, structured relationship review.
-- One checkup row per cycle per couple; each partner submits one response with
-- their answers (kept private until BOTH submit). When both are in, the checkup
-- is "revealed" and an AI summary (neutral third party) is stored on the row.

CREATE TABLE IF NOT EXISTS marriage_checkups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id     UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'collecting', -- collecting | revealed
  ai_summary    TEXT,
  ai_points     JSONB,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  revealed_at   TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_marriage_checkups_couple
  ON marriage_checkups(couple_id, created_at DESC);

-- At most one open (collecting) checkup per couple, so partners always land on
-- the same in-progress review.
CREATE UNIQUE INDEX IF NOT EXISTS uq_marriage_checkups_open
  ON marriage_checkups(couple_id)
  WHERE status = 'collecting';

CREATE TABLE IF NOT EXISTS marriage_checkup_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkup_id    UUID NOT NULL REFERENCES marriage_checkups(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers       JSONB NOT NULL, -- { scores, notes, gratitude, attention }
  submitted_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (checkup_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_marriage_checkup_responses_checkup
  ON marriage_checkup_responses(checkup_id);
