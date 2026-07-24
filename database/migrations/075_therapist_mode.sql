-- Therapist Mode ("引導模式") — the facilitated, turn-based therapy session.
--
-- The AI stops writing advice essays and instead runs a live session: it picks
-- one exercise "card", directs one partner, scores the response, then moves on.
-- That needs (1) session state per event — which card is active, whose turn it
-- is, which cards are done, and the running skill scores — and (2) a way to
-- render each AI turn as a structured card instead of a plain message.

-- One facilitation session per event (a session can be re-started, replacing
-- the row). turn_owner is the user we're currently waiting on (NULL = the
-- facilitator's move / either partner). skill_scores is { skill: {attempts,
-- score} } rolled up into 關係技巧分數; completed_cards feeds the 今日練習 list.
CREATE TABLE IF NOT EXISTS event_facilitation_sessions (
  event_id        UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active',
  active_card     TEXT,
  turn_owner      UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_cards TEXT[] NOT NULL DEFAULT '{}',
  skill_scores    JSONB NOT NULL DEFAULT '{}'::jsonb,
  step_count      INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Structured payload for AI facilitator turns (card, target, instruction,
-- quickReplies, evaluation, sessionDone). NULL for ordinary human messages, so
-- the frontend renders those as normal bubbles and AI turns as therapist cards.
ALTER TABLE event_messages
  ADD COLUMN IF NOT EXISTS facilitation JSONB;
