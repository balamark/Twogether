-- Backfill the schema that until now only existed as lazy "CREATE TABLE IF NOT
-- EXISTS" / "ALTER TABLE" calls inside route code. Those calls ran on request
-- paths (some on every request), costing DB round trips and, for ALTER TABLE,
-- an ACCESS EXCLUSIVE lock even when the column already existed. With these
-- objects owned by a migration, the runtime DDL is removed and migrations are
-- the single source of truth for the schema.
--
-- Definitions are copied verbatim from the route code they replace, so on any
-- database where the routes already created them (production, staging) every
-- statement here is a no-op.

-- 關係報告 therapy summaries (was routes/events.js ensureTherapySummariesTable).
CREATE TABLE IF NOT EXISTS therapy_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  period_days INTEGER NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  summary JSONB NOT NULL,
  event_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (couple_id, input_hash)
);
-- event_count was added after the table first shipped.
ALTER TABLE therapy_summaries ADD COLUMN IF NOT EXISTS event_count INTEGER;

-- 溝通模式 summaries (was routes/events.js ensureCommunicationPatternsTable).
CREATE TABLE IF NOT EXISTS communication_pattern_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  input_hash VARCHAR(64) NOT NULL,
  summary JSONB NOT NULL,
  event_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (couple_id, input_hash)
);

-- AI appreciation-question cache (was routes/love-moments.js
-- ensureAppreciationQuestionCacheTable).
CREATE TABLE IF NOT EXISTS appreciation_question_cache (
  scope_id VARCHAR(64) PRIMARY KEY,
  questions JSONB NOT NULL,
  provider VARCHAR(32),
  model VARCHAR(64),
  gen_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Event deep-link on notifications (was routes/intimacy-requests.js
-- ensureNotificationsEventIdColumn, which runs on every 通知中心 load and so is
-- the definition existing databases most likely got). Plain UUID to match it.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_id UUID;
