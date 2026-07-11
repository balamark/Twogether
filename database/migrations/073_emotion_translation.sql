-- Emotion / need translation ("情緒翻譯") for conversation threads.
--
-- A shared, per-thread lens: when a couple turns it on, every human message
-- shows an AI translation of the underlying emotion + need beneath it, visible
-- to BOTH partners. Messages are immutable, so a translation is generated once
-- per message ever and reused by both partners (cheap, no per-render billing).
--
-- Covers both surfaces: the per-event thread (event_messages) and the Wall
-- thread (wall_post_replies). message_id is not FK-constrained because it can
-- reference either table; `surface` disambiguates.
CREATE TABLE IF NOT EXISTS message_need_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surface VARCHAR(10) NOT NULL CHECK (surface IN ('event', 'wall')),
  message_id UUID NOT NULL,
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
  translation JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (surface, message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_need_translations_couple
  ON message_need_translations (couple_id);

-- Shared toggle state per thread, so both partners load the same on/off lens.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS translation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE wall_posts
  ADD COLUMN IF NOT EXISTS translation_enabled BOOLEAN NOT NULL DEFAULT FALSE;
