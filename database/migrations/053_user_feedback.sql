-- App-level user feedback / reviews ("用戶心得"). Users submit a star rating +
-- a short review from their profile; an admin approves it before it shows up in
-- the logged-out "聽聽其他用戶怎麼說" social-proof section. Mirrors the
-- therapist_reviews moderation shape (pending -> approved | hidden).

CREATE TABLE IF NOT EXISTS user_feedback (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name     VARCHAR(80) NOT NULL,                    -- name shown publicly
  rating           SMALLINT NOT NULL,                       -- 1-5 stars
  body             TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status           VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending | approved | hidden
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reviewed_at      TIMESTAMP WITH TIME ZONE,

  CONSTRAINT user_feedback_rating_valid CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT user_feedback_status_valid CHECK (status IN ('pending', 'approved', 'hidden'))
);

-- Logged-out section shows "approved reviews, newest first".
CREATE INDEX IF NOT EXISTS idx_user_feedback_approved
  ON user_feedback(created_at DESC)
  WHERE status = 'approved';

-- Admin moderation queue filters by status.
CREATE INDEX IF NOT EXISTS idx_user_feedback_status
  ON user_feedback(status, created_at DESC);
