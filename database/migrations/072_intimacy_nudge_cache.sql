-- Server-side cache for the「溫柔提醒」nudge suggestions shown on the
-- 已經幾天沒有親密了 card. Keyed by (couple_id, days): re-opening the same gap, or
-- the partner opening it, reuses the same three AI-generated lines for free
-- instead of re-billing the daily AI budget. A different day count generates a
-- fresh set; `regenerate` on the route bypasses and refreshes the entry.
CREATE TABLE IF NOT EXISTS intimacy_nudge_cache (
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  days INTEGER NOT NULL,
  suggestions JSONB NOT NULL,
  provider VARCHAR(32),
  model VARCHAR(64),
  gen_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (couple_id, days)
);
