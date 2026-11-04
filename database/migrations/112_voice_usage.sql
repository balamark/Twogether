-- 語音輸入：usage ledger for the 🎤 speech-to-text button.
--
-- One row per transcribed clip, for signed-in users (user_id) and guests
-- (guest_id + ip_hash). Powers the daily caps — free users get a few minutes a
-- day, premium is unlimited, a guest gets 3 clips — and the spend audit.
-- Neither the audio nor the transcript is ever stored.

CREATE TABLE IF NOT EXISTS voice_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id VARCHAR(64),
    ip_hash VARCHAR(64),
    audio_ms INTEGER NOT NULL,
    bytes INTEGER,
    provider VARCHAR(32),
    model VARCHAR(64),
    latency_ms INTEGER,
    cost_usd NUMERIC(12, 8),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_usage_user_day
    ON voice_usage (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_usage_guest
    ON voice_usage (guest_id, created_at DESC) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_usage_ip_day
    ON voice_usage (ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_usage_created
    ON voice_usage (created_at DESC);

ALTER TABLE public.voice_usage ENABLE ROW LEVEL SECURITY;
