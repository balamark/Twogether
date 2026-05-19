-- Tracks per-user AI calls for the events × icebreaker feature so we can
-- (a) enforce a daily cost cap, and (b) audit raw cost / latency offline.
--
-- Notes:
-- - raw_input is captured so we can debug post-hoc what the user typed.
--   It is NOT exposed by any API; only present in logs and this table.
-- - kind = 'icebreaker' counts toward the daily cap. Other kinds are
--   recorded but unrestricted today.

CREATE TABLE IF NOT EXISTS event_ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(32) NOT NULL,
    provider VARCHAR(32),
    model VARCHAR(64),
    duration_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_create_tokens INTEGER,
    cache_read_tokens INTEGER,
    cost_usd NUMERIC(12, 8),
    raw_input TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_ai_usage_user_day
    ON event_ai_usage (user_id, kind, created_at DESC);
