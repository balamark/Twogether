-- Generic per-user psychological assessments. The first is the「愛的語言」(5
-- love languages) quiz; the same table holds future quizzes (MBTI, 星座…) keyed
-- by `type`, so the result-storage + couple-visibility plumbing is reused.
--
--   type    : assessment kind, e.g. 'love_language' (future: 'mbti', 'zodiac')
--   result  : primary result code, e.g. 'words' | 'time' | 'gifts' | ...
--   scores  : full per-option breakdown as JSON, e.g. {"words":6,"time":4,...}
--
-- One row per (user, type): retaking the quiz upserts.

CREATE TABLE IF NOT EXISTS user_assessments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(32) NOT NULL,
  result      VARCHAR(32) NOT NULL,
  scores      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT user_assessments_user_type_key UNIQUE (user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_user_assessments_user ON user_assessments(user_id);
