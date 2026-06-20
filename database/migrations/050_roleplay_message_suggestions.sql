-- Roleplay invitation AI messages: persistent cache + user feedback.
--
-- The 5 AI-generated opening messages for a given script are deterministic
-- enough to cache: scripts don't change often, the first generation is slow
-- (~5s) and costs an LLM call. We cache by (script_id, content_hash) so an
-- edited custom script (new hash) regenerates while identical content is reused
-- across couples. The roleplay branch checks this cache before calling the LLM.

-- 1. roleplay_message_cache — one row per (script, content version). messages is
--    a JSONB array of { level, label, text }. gen_count tracks how many times we
--    (re)generated for this content version, for admin insight.
CREATE TABLE IF NOT EXISTS roleplay_message_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id VARCHAR(128) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  script_title VARCHAR(200),
  category VARCHAR(50),
  summary TEXT,
  messages JSONB NOT NULL,
  provider VARCHAR(32),
  model VARCHAR(64),
  gen_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (script_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_roleplay_cache_script
  ON roleplay_message_cache(script_id, updated_at DESC);

-- 2. roleplay_message_feedback — one row per thumb up/down (with optional text)
--    on a generated message. Drives admin quality insight per script/level.
CREATE TABLE IF NOT EXISTS roleplay_message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  script_id VARCHAR(128),
  script_title VARCHAR(200),
  level VARCHAR(16),
  message_text TEXT,
  rating VARCHAR(8) NOT NULL, -- 'up' | 'down'
  feedback_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roleplay_feedback_script
  ON roleplay_message_feedback(script_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roleplay_feedback_created
  ON roleplay_message_feedback(created_at DESC);
