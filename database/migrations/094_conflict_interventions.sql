-- Sophie 衝突即時介入 (Conflict Intervention / Sophie Mediator).
--
-- North star: Sophie never blocks or rewrites what a partner wants to say — she
-- only controls WHEN and HOW the other partner receives it. When a message is
-- sent in a heated moment, the ORIGINAL text is saved verbatim, held from the
-- partner, and a short emotional intervention runs before it is released. The
-- partner then sees the original message AND Sophie's interpretation of the
-- underlying need beside it.
--
-- One row = one held message + its intervention (MVP keeps the Message object
-- and the ConflictIntervention object unified). Nothing here is ever an edit of
-- the user's words: original_text is immutable once written.

CREATE TABLE IF NOT EXISTS conflict_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    -- The partner who wrote (and owns) the message.
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- The partner who will receive it once released.
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The user's own words, saved verbatim and never rewritten.
    original_text TEXT NOT NULL CHECK (char_length(original_text) BETWEEN 1 AND 2000),

    -- 0 normal · 1 tension · 2 high emotion · 3 escalation.
    emotion_level SMALLINT NOT NULL DEFAULT 0
        CHECK (emotion_level BETWEEN 0 AND 3),
    detected_signals TEXT[] NOT NULL DEFAULT '{}',

    -- Where the message is in its delivery lifecycle. HELD / IN_INTERVENTION are
    -- not yet visible to the partner; RELEASED + DELIVERED are.
    message_status VARCHAR(16) NOT NULL DEFAULT 'HELD'
        CHECK (message_status IN ('HELD','IN_INTERVENTION','RELEASED','DELIVERED')),

    -- Intervention state machine (mirrors ConflictIntervention.state in the PRD).
    state VARCHAR(24) NOT NULL DEFAULT 'PAUSED'
        CHECK (state IN ('PAUSED','EXPLORING','TRANSLATING','CONFIRMING','RELEASING','ACTIVE_MEDIATION','COMPLETED')),

    -- What the user picked in the single core question ("被在乎"/"界線"/…), and
    -- Sophie's emotional translation of the underlying need. Both optional: a
    -- never-silence direct release completes with neither.
    user_emotion TEXT,
    underlying_need TEXT,
    emotional_translation TEXT,
    translation_confirmed BOOLEAN NOT NULL DEFAULT FALSE,

    -- True when the sent text tripped a safety signal (threat / violence /
    -- self-harm). These skip ordinary mediation — the UI routes to a safety
    -- response instead of translating the words as a normal conflict.
    safety_flag BOOLEAN NOT NULL DEFAULT FALSE,

    -- The recipient's acknowledgement after they read it (§14). NULL until they
    -- answer 我理解了 / 我還不理解.
    partner_understood BOOLEAN,
    partner_understood_at TIMESTAMP WITH TIME ZONE,

    released_at TIMESTAMP WITH TIME ZONE,
    delivered_read_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- The sender resumes their one in-flight (not yet released) intervention.
CREATE INDEX IF NOT EXISTS idx_conflict_interventions_sender_open
    ON conflict_interventions (sender_id, created_at DESC)
    WHERE message_status IN ('HELD','IN_INTERVENTION');

-- The recipient's inbox of released messages, newest first.
CREATE INDEX IF NOT EXISTS idx_conflict_interventions_recipient
    ON conflict_interventions (recipient_id, released_at DESC)
    WHERE message_status IN ('RELEASED','DELIVERED');

CREATE INDEX IF NOT EXISTS idx_conflict_interventions_couple
    ON conflict_interventions (couple_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_conflict_interventions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conflict_interventions_updated_at ON conflict_interventions;
CREATE TRIGGER trigger_update_conflict_interventions_updated_at
    BEFORE UPDATE ON conflict_interventions
    FOR EACH ROW
    EXECUTE FUNCTION update_conflict_interventions_updated_at();

-- RLS (063 convention: enabled, zero policies). The backend connects as a
-- rolbypassrls role; enabling RLS with no policies locks the Supabase anon key
-- out while the app keeps working. Authorization is application-level in
-- lib/conflictMediator.js / routes/conflict-intervention.js.
ALTER TABLE conflict_interventions ENABLE ROW LEVEL SECURITY;
