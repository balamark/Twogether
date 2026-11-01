-- 訪客模式：5 次真的 AI 試用額度。
--
-- Visitors without an account browse the real app on a sample couple
-- (src/guest/). Their four core AI actions (icebreaker, draft analysis, reply
-- rewrite, emotion acceptance) hit the real LLM through the public
-- /api/guest-ai endpoint, capped at 5 per anonymous guest id with a per-IP
-- daily backstop. Unlike event_ai_usage, the guest's text is NEVER stored —
-- only who/when/cost, so the quota and spend can be enforced and audited.

CREATE TABLE IF NOT EXISTS guest_ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id VARCHAR(64) NOT NULL,
    ip_hash VARCHAR(64) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    provider VARCHAR(32),
    model VARCHAR(64),
    duration_ms INTEGER,
    cost_usd NUMERIC(12, 8),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_ai_usage_guest
    ON guest_ai_usage (guest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_ai_usage_ip_day
    ON guest_ai_usage (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_ai_usage_created
    ON guest_ai_usage (created_at DESC);
