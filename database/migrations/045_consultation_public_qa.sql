-- "公開問答" (Public Q&A): let an existing free consultation chat be published,
-- read-only and anonymised, so other users can learn from how a therapist
-- handled a similar problem.
--
-- This is NOT a new chatroom — it reuses the existing therapist_consultations
-- room (041) and its consultation_messages log (042). Publishing is a two-party
-- consent handshake: one side (the client OR the therapist) proposes it, the
-- OTHER side approves, and either side can withdraw it again. Once published the
-- asker is rendered anonymously ("匿名個案"); the therapist is shown, since the
-- thread showcases their work.
--
-- Therapist participation in free chats is also the engagement signal that feeds
-- the monthly revenue-share pool (migration 047): a therapist's monthly activity
-- is the count of consultation_messages they sent that month. We add a supporting
-- index for that aggregation here. "Helpful" votes on published threads are an
-- additional weighting input we capture now and use when the pool moves off the
-- initial even split.

ALTER TABLE therapist_consultations
  -- Publish lifecycle / consent handshake:
  --   private            : default, room is private to its participants
  --   client_requested   : the client proposed publishing, awaiting therapist
  --   therapist_requested: the therapist proposed publishing, awaiting client
  --   published          : both parties consented, visible in the public list
  --   withdrawn          : was published/proposed, then pulled back (hidden)
  ADD COLUMN IF NOT EXISTS public_status VARCHAR(24) NOT NULL DEFAULT 'private',
  -- Who proposed, who approved (both reference users; SET NULL keeps history if
  -- an account is deleted). published_at stamps when it went public.
  ADD COLUMN IF NOT EXISTS public_requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_approved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at        TIMESTAMP WITH TIME ZONE,
  -- Headline shown in the public list, set by whoever proposes publishing. The
  -- transcript itself is anonymised at render time, never stored differently.
  ADD COLUMN IF NOT EXISTS public_title        VARCHAR(200);

ALTER TABLE therapist_consultations DROP CONSTRAINT IF EXISTS therapist_consultations_public_status_valid;
ALTER TABLE therapist_consultations ADD CONSTRAINT therapist_consultations_public_status_valid
  CHECK (public_status IN ('private', 'client_requested', 'therapist_requested', 'published', 'withdrawn'));

-- Public list is "published consultations, newest first"; partial index keeps it
-- cheap as private rooms pile up.
CREATE INDEX IF NOT EXISTS idx_therapist_consultations_published
  ON therapist_consultations(published_at DESC)
  WHERE public_status = 'published';

-- "Helpful" votes on a published thread. One vote per (consultation, voter).
-- Feeds the future engagement-weighted pool split (047).
CREATE TABLE IF NOT EXISTS consultation_public_votes (
  consultation_id UUID NOT NULL REFERENCES therapist_consultations(id) ON DELETE CASCADE,
  voter_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (consultation_id, voter_id)
);

-- Monthly engagement aggregation for the revenue pool counts each therapist's
-- messages within a month. The pool query joins consultation_messages.sender_id
-- to the consultation's therapist user, so indexing (sender_id, created_at)
-- makes "messages by this user in [month)" cheap.
CREATE INDEX IF NOT EXISTS idx_consultation_messages_sender_month
  ON consultation_messages(sender_id, created_at);
