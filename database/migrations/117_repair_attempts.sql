-- 回頭接住 Repair attempts — the small move after a fight.
--
-- Many couples fight, part on a sour note, cool down and carry on: dinner,
-- work, as if it's over. The event passed; the feeling was never handled.
-- Gottman found that what predicts a lasting relationship isn't whether a
-- couple fights but whether someone makes a *repair attempt* afterwards — and
-- that it still counts an hour or a day later ("第二、第三時間的同理").
--
-- One row is one repair attempt, in one of two states:
--
--   scheduled — "冷靜後提醒我": right after a fight you can't be kind yet, so
--               the app reminds you at remind_at (the lazy sweep in
--               routes/repair.js stamps reminded_at when it notifies you).
--               No text yet; only the sender ever sees it.
--   sent      — a short note (usually emotional validation, e.g. 「我想了一下，
--               你那時會那麼生氣，其實是有原因的」) delivered to the partner,
--               who can answer once: received (被接住了) / talk (想再聊聊) /
--               need_time (還需要一點時間 — never framed as a rejection).
--
-- A scheduled row becomes the sent row when the user writes the note, so the
-- reminder and the note it led to stay one record.
--
-- couple_id / recipient_id are NULL for a solo user's reminder; a note can
-- only be sent to a paired partner (enforced in the route).

CREATE TABLE IF NOT EXISTS repair_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'sent')),
    kind VARCHAR(16)
        CHECK (kind IS NULL OR kind IN ('validate', 'thanks', 'own_part', 'care', 'pause', 'light')),
    text TEXT
        CHECK (text IS NULL OR char_length(text) BETWEEN 1 AND 500),
    remind_at TIMESTAMP WITH TIME ZONE,
    reminded_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    response VARCHAR(16)
        CHECK (response IS NULL OR response IN ('received', 'talk', 'need_time')),
    response_note TEXT
        CHECK (response_note IS NULL OR char_length(response_note) <= 300),
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT repair_attempts_sent_shape CHECK (
        status <> 'sent' OR (text IS NOT NULL AND kind IS NOT NULL AND sent_at IS NOT NULL AND recipient_id IS NOT NULL)
    )
);

-- 首頁 card: my own recent rows, and notes sent to me.
CREATE INDEX IF NOT EXISTS idx_repair_attempts_sender
    ON repair_attempts (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_attempts_recipient
    ON repair_attempts (recipient_id, sent_at DESC) WHERE status = 'sent';
-- Lazy reminder sweep: due, not-yet-reminded scheduled rows across couples.
CREATE INDEX IF NOT EXISTS idx_repair_attempts_due
    ON repair_attempts (remind_at) WHERE status = 'scheduled' AND reminded_at IS NULL;

ALTER TABLE public.repair_attempts ENABLE ROW LEVEL SECURITY;
