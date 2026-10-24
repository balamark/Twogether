-- 專屬諮商空間 (Dedicated counseling space) — a shared channel between a couple
-- and their dedicated therapist (081), plus the page they open DURING a session.
--
-- Everything hangs off the couple_therapists link (link_id), not just the
-- couple: switching to a new dedicated therapist starts a fresh space, so a new
-- therapist never reads what the couple wrote to the previous one.
--
--   dedicated_messages      — the three-way message thread (both partners + therapist)
--   dedicated_sessions      — one row per counseling session; notes = 本次諮商摘要.
--                             At most one open (ended_at IS NULL) session per link.
--   dedicated_agenda_items  — 下次要談 items. Created by hand, from a message, or
--                             from a 話題建議 topic. Checking one off during a session
--                             stamps session_id so past sessions show what was covered.

CREATE TABLE IF NOT EXISTS dedicated_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id      UUID NOT NULL REFERENCES couple_therapists(id) ON DELETE CASCADE,
  couple_id    UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  sender_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  is_therapist BOOLEAN NOT NULL DEFAULT FALSE,
  content      TEXT NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dedicated_messages_link_created
  ON dedicated_messages (link_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dedicated_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id     UUID NOT NULL REFERENCES couple_therapists(id) ON DELETE CASCADE,
  couple_id   UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  notes       TEXT NOT NULL DEFAULT '',
  started_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dedicated_sessions_open
  ON dedicated_sessions (link_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dedicated_sessions_link_started
  ON dedicated_sessions (link_id, started_at DESC);

CREATE TABLE IF NOT EXISTS dedicated_agenda_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id           UUID NOT NULL REFERENCES couple_therapists(id) ON DELETE CASCADE,
  couple_id         UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  content           TEXT NOT NULL,
  source            VARCHAR(16) NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'message', 'topic')),
  source_message_id UUID REFERENCES dedicated_messages(id) ON DELETE SET NULL,
  source_ref        VARCHAR(200),      -- topic key ('topic:<title>' / 'lib:<id>') for de-duping
  status            VARCHAR(16) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'discussed')),
  session_id        UUID REFERENCES dedicated_sessions(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dedicated_agenda_link
  ON dedicated_agenda_items (link_id, status, created_at);
