-- Dedicated therapist (專屬心理師) — a couple can add ONE approved therapist as
-- their dedicated therapist. Once added it takes effect immediately (no therapist
-- acceptance) and can be revoked at any time by either partner.
--
-- The dedicated therapist gets read-only access to the couple's non-private wall
-- posts and 好好說話 (events) content. Private (is_private) items stay author-only
-- and are never exposed. If (and only if) can_comment is granted, the therapist
-- may also leave replies/messages on non-private threads.

CREATE TABLE IF NOT EXISTS couple_therapists (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  couple_id    UUID NOT NULL REFERENCES couples(id)    ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  added_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  can_comment  BOOLEAN NOT NULL DEFAULT FALSE,   -- may the therapist leave replies/messages?
  status       VARCHAR(16) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'revoked')),
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  revoked_at   TIMESTAMP WITH TIME ZONE,
  revoked_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

-- At most one active dedicated therapist per couple.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_couple_therapist
  ON couple_therapists(couple_id) WHERE status = 'active';
-- Fast lookup of a therapist's active client couples.
CREATE INDEX IF NOT EXISTS idx_couple_therapists_therapist_active
  ON couple_therapists(therapist_id) WHERE status = 'active';

-- Flag therapist-authored replies/messages so the UI can render them distinctly
-- from the two partners (mirrors the existing is_ai flag).
ALTER TABLE wall_post_replies
  ADD COLUMN IF NOT EXISTS is_therapist BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE event_messages
  ADD COLUMN IF NOT EXISTS is_therapist BOOLEAN NOT NULL DEFAULT FALSE;
