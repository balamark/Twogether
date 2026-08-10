-- 親密記錄・快速回應 — one-tap reaction + one short sentence per person.
--
-- Why: a love moment is logged by one person and then just sits in the list as
-- a single row. The other half has no way to say "I saw this, I loved it", so
-- the record is a diary entry nobody answers. This gives the moment a reply
-- that costs one tap, plus a sentence when a tap isn't enough.
--
-- Unlike the wall (084), BOTH partners may respond here — including whoever
-- recorded it. The moment belongs to the two of them, not to its author.
--
-- One table rather than two: the product rule is exactly one response per
-- person per moment (one chip + one sentence), so the primary key enforces the
-- whole invariant in one place, one query reads it, and taking it back is a
-- single DELETE. Splitting reaction and note apart would only let them drift.
--
-- `reaction` stores the KEY ('love'/'sweet'/'fire'/'hug'/'memorable') — never
-- the emoji or the zh-TW label — so copy can change without a data migration.
-- The whitelist lives in MOMENT_REACTIONS (routes/love-moments.js), not in a
-- CHECK, so adding a chip doesn't need a migration. The CHECK below is only the
-- "never persist an empty row" guard: clearing both fields deletes the row.

CREATE TABLE IF NOT EXISTS love_moment_responses (
  moment_id  UUID NOT NULL REFERENCES love_moments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction   VARCHAR(16),
  note       VARCHAR(80),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (moment_id, user_id),
  CONSTRAINT love_moment_responses_not_empty
    CHECK (reaction IS NOT NULL OR note IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_love_moment_responses_moment
  ON love_moment_responses(moment_id);

-- Migration 063 enabled RLS on every table that existed then, to lock the
-- Supabase PostgREST/anon path (the backend connects as `postgres` and bypasses
-- RLS, so no policies are needed). New tables have to opt in themselves.
ALTER TABLE love_moment_responses ENABLE ROW LEVEL SECURITY;
