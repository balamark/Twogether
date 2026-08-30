-- Therapy Topics (話題建議) — proactively suggests discussion topics for the
-- couple's next therapy session, drawn from their recent events. Unlike
-- therapy_summaries (074) this NEVER guards on "no events": when recent
-- conflict is scarce, routes/events.js widens its lookback and/or falls back
-- to general relationship-maintenance framing, so the couple always gets 3-5
-- topics — "no conflict doesn't mean no relationship problem" is the whole
-- point of the feature.

-- One row per (couple, input event-set) — same caching shape as
-- therapy_summaries. Re-opens are free; regenerates when the underlying
-- event set (or the quiet/non-quiet mode) changes.
CREATE TABLE IF NOT EXISTS therapy_topic_suggestions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id    UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  period_days  INTEGER NOT NULL,               -- requested window (14 or 30)
  applied_days INTEGER NOT NULL,                -- actual window used (== period_days unless widened to 60 when recent events were sparse)
  quiet        BOOLEAN NOT NULL DEFAULT FALSE,  -- true only when the recent window had NO events (drives the "最近很平靜" reassurance framing)
  input_hash   VARCHAR(64) NOT NULL,
  topics       JSONB NOT NULL,                  -- { intro: string, topics: [{ title, whySuggested, prompts: string[] }] }
  event_count  INTEGER,                          -- events (primary + widened) fed to the generator
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (couple_id, input_hash)
);

CREATE INDEX IF NOT EXISTS idx_therapy_topic_suggestions_couple_created
  ON therapy_topic_suggestions (couple_id, created_at DESC);

-- A couple's pick + free-text notes per topic within a specific generation.
-- Only a row a couple has actively acted on exists — no row means "not yet
-- decided", a cleaner client contract than a meaningless default status.
-- status is nullable: a couple can jot notes on a topic before picking a
-- status (or after clearing one), so a row can carry notes with no status yet.
CREATE TABLE IF NOT EXISTS therapy_topic_selections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id   UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  input_hash  VARCHAR(64) NOT NULL,
  topic_index INTEGER NOT NULL,
  status      VARCHAR(16)
                CHECK (status IS NULL OR status IN ('selected', 'saved', 'dismissed')),
  notes       TEXT,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (couple_id, input_hash, topic_index),
  FOREIGN KEY (couple_id, input_hash)
    REFERENCES therapy_topic_suggestions (couple_id, input_hash) ON DELETE CASCADE
);

-- Same pick + notes shape, for the static topic library (lib/therapyTopicLibrary.js)
-- — a curated set of relationship-maintenance topics always available with no
-- AI generation. Keyed by the library's stable topic_id rather than an
-- (input_hash, topic_index) pair since these aren't tied to any per-couple
-- generation; topic_id is validated against the static list at the app layer.
CREATE TABLE IF NOT EXISTS therapy_topic_library_selections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id   UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  topic_id    VARCHAR(64) NOT NULL,
  status      VARCHAR(16)
                CHECK (status IS NULL OR status IN ('selected', 'saved', 'dismissed')),
  notes       TEXT,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (couple_id, topic_id)
);
