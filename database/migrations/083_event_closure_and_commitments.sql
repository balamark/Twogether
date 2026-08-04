-- 一起收尾 — the forward-looking half of an event.
--
-- Until now the 事件 flow ended at a therapy note: a good read with no answer to
-- 下次怎麼辦. Reading a finished thread felt like watching a successful counselling
-- session and walking out with nothing. Closure adds one small observable
-- commitment per person plus an optional shared decision, every one of them
-- written by a human and reviewed by the other half. The AI comments on the
-- result; it does not decide it.
--
-- New event status 'closing' sits between the conversation and 'resolved'.
-- Either partner taps 一起收尾 once (no handshake) and both land in the flow;
-- the event resolves when every participant is terminal (submitted+reviewed,
-- skipped, or auto-skipped after 72h).
--
-- Shape rule encoded below: JSONB for things only ever read inside their own
-- event; real columns for anything a cross-event scheduler or list touches.
-- That is why commitments.due_at / follow_up_state are scalars — the follow-up
-- sweep (Batch 3) scans them across couples.

-- ---------------------------------------------------------------------------
-- events.status gains 'closing'
-- ---------------------------------------------------------------------------
-- The live constraint is the INLINE, unnamed column CHECK from migration 029,
-- so Postgres auto-generated its name. Discover it rather than guessing (same
-- approach as 082_wall_content_limits.sql). Matching on '%resolve_pending%' is
-- unambiguous: the only other CHECK on this table is events_public_status_valid
-- (055), which covers public_status IN ('private','published').
--
-- 'resolve_pending' is KEPT in the new constraint. Nothing produces it any more
-- (the two-step 標記為解決 → 確認解決 handshake is gone), but live rows exist in
-- production and the UI now renders them exactly like 'open'.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%resolve_pending%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE events DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_valid;
ALTER TABLE events ADD CONSTRAINT events_status_valid
  CHECK (status IN ('open', 'resolve_pending', 'closing', 'resolved'));

-- ---------------------------------------------------------------------------
-- event_closures — one row per event that entered 收尾
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_closures (
  event_id     UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  couple_id    UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  status       VARCHAR(24) NOT NULL DEFAULT 'collecting',

  -- 共同決定: 「下次這種情況，我們怎麼辦」. Same write → review → agree loop as a
  -- commitment, but shared, and OPTIONAL — some conflicts only need
  -- 「我下次會先問一聲」, and forcing a shared rule out of every argument
  -- produces filler.
  shared_decision        TEXT,
  shared_decision_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  shared_decision_status VARCHAR(20) NOT NULL DEFAULT 'none',
  shared_decision_note   TEXT,  -- partner's 調整建議, kept even when not adopted

  -- AI 見解 on the finished pair, written by whichever request wins the
  -- finalize claim, AFTER that claim succeeds — so a failed or quota-blocked
  -- LLM call can never strand an event in 'closing'.
  insight      JSONB,
  insight_at   TIMESTAMP WITH TIME ZONE,

  started_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deadline_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW() + INTERVAL '72 hours',
  finalized_at TIMESTAMP WITH TIME ZONE,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT event_closures_status_valid
    CHECK (status IN ('collecting', 'finalized', 'abandoned')),
  CONSTRAINT event_closures_decision_status_valid
    CHECK (shared_decision_status IN ('none', 'proposed', 'change_requested', 'agreed'))
);

CREATE INDEX IF NOT EXISTS idx_event_closures_couple
  ON event_closures(couple_id, started_at DESC);

-- Drives the lazy 72h auto-finalize sweep (there is no cron in this app; the
-- sweep rides GET /api/events, same pattern as relationship reminders in 058).
-- Tiny partial index — the working set is only ever "closures still open".
CREATE INDEX IF NOT EXISTS idx_event_closures_due
  ON event_closures(deadline_at)
  WHERE status = 'collecting';

-- ---------------------------------------------------------------------------
-- event_closure_participants — one row per partner per closure
-- ---------------------------------------------------------------------------
-- Both rows are seeded when the closure starts, so "is everyone terminal?" is a
-- single NOT EXISTS on status = 'pending' rather than a count against couples.
CREATE TABLE IF NOT EXISTS event_closure_participants (
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(16) NOT NULL DEFAULT 'pending',
  skip_reason  TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  reviewed_at  TIMESTAMP WITH TIME ZONE,  -- when I reviewed my partner's items
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  PRIMARY KEY (event_id, user_id),
  CONSTRAINT event_closure_participants_status_valid
    CHECK (status IN ('pending', 'submitted', 'skipped', 'auto_skipped'))
);

CREATE INDEX IF NOT EXISTS idx_event_closure_participants_user
  ON event_closure_participants(user_id, status);

-- ---------------------------------------------------------------------------
-- commitments — 「我下次願意做的一件小事」
-- ---------------------------------------------------------------------------
-- Personal: only the owner writes it and only the owner changes it. The partner
-- reviews (agree / request change) but a change request NEVER blocks finalize —
-- you cannot veto someone else's promise, you can only be heard.
--
-- Rows start 'draft' at submit and flip to 'active' at finalize, so the 72h
-- follow-up clock starts when the event actually resolves, not when someone
-- happened to type first.
CREATE TABLE IF NOT EXISTS commitments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id     UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  event_id      UUID REFERENCES events(id) ON DELETE SET NULL,
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text          TEXT NOT NULL CHECK (char_length(text) BETWEEN 4 AND 200),
  source        VARCHAR(16) NOT NULL DEFAULT 'closure',
  status        VARCHAR(16) NOT NULL DEFAULT 'draft',

  review_status VARCHAR(20) NOT NULL DEFAULT 'pending_review',
  review_note   TEXT,
  reviewed_at   TIMESTAMP WITH TIME ZONE,

  -- Batch 3 (follow-up). Set at activation; the sweep claims rows atomically.
  due_at            TIMESTAMP WITH TIME ZONE,
  follow_up_state   VARCHAR(16) NOT NULL DEFAULT 'pending',
  follow_up_sent_at TIMESTAMP WITH TIME ZONE,

  -- When a follow-up produces a smaller version, the old row is 'replaced' and
  -- points at the new one, so the chain records how the couple learned.
  replaced_by   UUID REFERENCES commitments(id) ON DELETE SET NULL,

  activated_at  TIMESTAMP WITH TIME ZONE,
  completed_at  TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT commitments_status_valid
    CHECK (status IN ('draft', 'active', 'completed', 'skipped', 'replaced')),
  CONSTRAINT commitments_source_valid
    CHECK (source IN ('closure', 'followup', 'rule', 'manual')),
  CONSTRAINT commitments_review_status_valid
    CHECK (review_status IN ('pending_review', 'agreed', 'change_requested')),
  CONSTRAINT commitments_follow_up_state_valid
    CHECK (follow_up_state IN ('pending', 'asked', 'answered'))
);

-- THE Batch 3 query: whose active commitment is due for a check-in right now.
CREATE INDEX IF NOT EXISTS idx_commitments_due
  ON commitments(due_at)
  WHERE status = 'active' AND follow_up_state = 'pending';

CREATE INDEX IF NOT EXISTS idx_commitments_owner
  ON commitments(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commitments_couple
  ON commitments(couple_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commitments_event
  ON commitments(event_id);

-- One live commitment per person per closure, so re-submitting before finalize
-- is a clean ON CONFLICT DO UPDATE. Replaced/skipped/completed rows are history
-- and deliberately fall outside the index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_commitments_event_owner_live
  ON commitments(event_id, owner_id)
  WHERE status IN ('draft', 'active');

-- ---------------------------------------------------------------------------
-- updated_at triggers (029_events.sql convention)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_event_closure_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_event_closures_updated_at ON event_closures;
CREATE TRIGGER trigger_update_event_closures_updated_at
    BEFORE UPDATE ON event_closures
    FOR EACH ROW
    EXECUTE FUNCTION update_event_closure_updated_at();

DROP TRIGGER IF EXISTS trigger_update_event_closure_participants_updated_at ON event_closure_participants;
CREATE TRIGGER trigger_update_event_closure_participants_updated_at
    BEFORE UPDATE ON event_closure_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_event_closure_updated_at();

DROP TRIGGER IF EXISTS trigger_update_commitments_updated_at ON commitments;
CREATE TRIGGER trigger_update_commitments_updated_at
    BEFORE UPDATE ON commitments
    FOR EACH ROW
    EXECUTE FUNCTION update_event_closure_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (063 convention: enabled, zero policies)
-- ---------------------------------------------------------------------------
-- The app never uses Supabase's PostgREST/anon path; the backend connects as
-- `postgres` (rolbypassrls). Enabling RLS with no policies locks the anon key
-- out of these tables while the app keeps working. Authorization stays
-- application-level via assertEventAccess.
ALTER TABLE event_closures             ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_closure_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitments                ENABLE ROW LEVEL SECURITY;
