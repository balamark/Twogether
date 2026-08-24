-- 👍/👎 feedback on AI-generated responses (情緒翻譯 / AI 諮商師).
--
-- Lets a user flag whether a specific AI output read well. Down-votes capture
-- the surrounding conversation (context_snapshot) so bad cases — chiefly 你/我
-- perspective/attribution errors — can be diagnosed later and curated into the
-- reflection judge's rubric (negative examples). One row per (user, surface,
-- reference); re-voting updates the same row rather than piling up duplicates.
--
-- reference_id is not FK-constrained because it can point at either an
-- event_messages / wall_post_replies row (counselor) or a translated message id
-- (emotion_translation); `surface` disambiguates. RLS is enabled with no
-- policies (the 063 convention): the backend connects as a bypass-RLS role and
-- authorization stays application-level.
CREATE TABLE IF NOT EXISTS ai_response_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  surface VARCHAR(32) NOT NULL CHECK (surface IN ('emotion_translation', 'counselor')),
  reference_id UUID,
  message_text TEXT,
  context_snapshot JSONB,
  rating VARCHAR(8) NOT NULL CHECK (rating IN ('up', 'down')),
  feedback_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- One vote per user per AI output; re-voting flips this row (ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_response_feedback_user_ref
  ON ai_response_feedback (user_id, surface, reference_id);

-- Fast "recent bad cases per surface" scan for the review queue.
CREATE INDEX IF NOT EXISTS idx_ai_response_feedback_downvotes
  ON ai_response_feedback (surface, created_at DESC)
  WHERE rating = 'down';

ALTER TABLE ai_response_feedback ENABLE ROW LEVEL SECURITY;
