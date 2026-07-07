-- Server-side cache for per-event AI previews (emotion acceptance, counselor
-- comment). Keyed by a hash of the exact generation input (summary + thread +
-- persona), so repeat taps on the same unchanged thread reuse the stored
-- response instead of re-billing LLM tokens. New messages change the hash and
-- naturally invalidate the cache.
CREATE TABLE IF NOT EXISTS event_ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(30) NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id, kind, input_hash)
);
