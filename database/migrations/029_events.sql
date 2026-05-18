-- 事件 × AI 破冰 — couple-scoped emotional events with AI-rewritten
-- ice-breaker versions and a threaded conversation log.
--
-- Raw emotional text is never persisted. Only the three AI-generated
-- versions plus the parsed metadata (summary, emotions, tags) live on
-- the row. The version the author picked is also seeded into
-- event_messages as the first message in the thread.

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    title VARCHAR(120) NOT NULL,
    summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 1000),
    emotions TEXT[] NOT NULL DEFAULT '{}',
    tags TEXT[] NOT NULL DEFAULT '{}',
    toxicity_flags TEXT[] NOT NULL DEFAULT '{}',

    ai_neutral TEXT NOT NULL,
    ai_firm    TEXT NOT NULL,
    ai_warm    TEXT NOT NULL,
    selected_version VARCHAR(8)
        CHECK (selected_version IN ('neutral','firm','warm') OR selected_version IS NULL),

    is_private BOOLEAN NOT NULL DEFAULT FALSE,

    status VARCHAR(16) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','resolve_pending','resolved')),
    resolve_requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolve_requested_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_couple        ON events(couple_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_couple_status ON events(couple_id, status);
CREATE INDEX IF NOT EXISTS idx_events_created_by    ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_tags          ON events USING GIN (tags);

CREATE TABLE IF NOT EXISTS event_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_event_messages_event   ON event_messages(event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_event_messages_sender  ON event_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_event_messages_unread  ON event_messages(event_id) WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION update_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_events_updated_at ON events;
CREATE TRIGGER trigger_update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_events_updated_at();
