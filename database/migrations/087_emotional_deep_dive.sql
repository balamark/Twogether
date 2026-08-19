-- 情緒深潛 Emotional Deep Dive — a guided journey from a present conflict down to
-- the older, more familiar feeling underneath it, and back up into a letter the
-- partner can actually hear.
--
-- Until now the 好好說話 flow stopped at 現在這件事 (情緒翻譯 → Mirror → Validation
-- → 收尾). It never answered 「為什麼這件事對我這麼痛？」. Deep Dive adds one private,
-- self-paced journey: name the feeling → is it familiar → a memory → a letter to
-- the past → a letter of self-compassion → what I need now → a vulnerable letter
-- to my partner → the partner reads, mirrors, validates, responds → repair.
--
-- Two design rules encoded below (both load-bearing):
--
-- 1. Pause / resume is free. The journey is a server-persisted state machine:
--    `current_step` is the resume pointer and `state` (JSONB) holds every answer.
--    Closing the UI is a pause; there is no separate "draft" concept to lose.
--
-- 2. Past letters are PRIVATE forever (PRD §30). 給過去的信 and 自我安撫的信 are the
--    user working through their own history: the partner must never see them. Only
--    the 寫給伴侶的信 is shareable, and only once the user taps 分享. `visibility`
--    enforces this at the row; the serializer in lib/deepDiveAccess.js re-checks it.
--
-- Shape rule follows 083: `status` is a scalar + named CHECK; anything only ever
-- read inside one journey is JSONB (`state`, `validation`); RLS enabled with zero
-- policies (063 convention) — authorization stays application-level via
-- assertJourneyAccess.

-- ---------------------------------------------------------------------------
-- deep_dive_journeys — one row per journey (one person's exploration)
-- ---------------------------------------------------------------------------
-- created_by is the explorer and the owner of every private letter. couple_id is
-- nullable on purpose: a solo (unpaired) user can walk the whole self-exploration
-- half; only the 分享 step needs a real partner. event_id is set when the journey
-- was started from a specific 事件 (Entry A) so the AI can read that context.
CREATE TABLE IF NOT EXISTS deep_dive_journeys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  couple_id     UUID REFERENCES couples(id) ON DELETE CASCADE,
  event_id      UUID REFERENCES events(id) ON DELETE SET NULL,

  status        VARCHAR(24) NOT NULL DEFAULT 'in_progress',
  current_step  VARCHAR(32) NOT NULL DEFAULT 'CURRENT_EMOTION',

  -- Every non-letter answer: { situation, current_emotions[], deeper_emotions[],
  -- familiarity, memory_text, past_person, current_need{type,custom},
  -- repair{shared_understanding, agreed_action}, skipped[] }. Only ever read
  -- inside its own journey, so JSONB not columns.
  state         JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT deep_dive_journeys_status_valid
    CHECK (status IN ('in_progress', 'shared', 'partner_reading',
                      'partner_responded', 'completed', 'abandoned'))
);

-- Resume query: the caller's most recent unfinished journey.
CREATE INDEX IF NOT EXISTS idx_deep_dive_journeys_creator
  ON deep_dive_journeys(created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_deep_dive_journeys_couple
  ON deep_dive_journeys(couple_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- deep_dive_letters — the written artifacts, PRIVATE by default
-- ---------------------------------------------------------------------------
-- kind 'past' / 'compassion' are always private (the serializer never returns
-- them to anyone but the owner). kind 'partner' starts private and flips to
-- 'shared' at the 分享 step. One letter per kind per journey → re-saving a step
-- is a clean ON CONFLICT DO UPDATE (same mechanism as commitments in 083).
CREATE TABLE IF NOT EXISTS deep_dive_letters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id    UUID NOT NULL REFERENCES deep_dive_journeys(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          VARCHAR(16) NOT NULL,
  visibility    VARCHAR(12) NOT NULL DEFAULT 'private',
  content       TEXT NOT NULL DEFAULT '',
  status        VARCHAR(12) NOT NULL DEFAULT 'draft',

  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT deep_dive_letters_kind_valid
    CHECK (kind IN ('past', 'compassion', 'partner')),
  CONSTRAINT deep_dive_letters_visibility_valid
    CHECK (visibility IN ('private', 'shared')),
  CONSTRAINT deep_dive_letters_status_valid
    CHECK (status IN ('draft', 'shared'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_deep_dive_letter
  ON deep_dive_letters(journey_id, kind);

-- ---------------------------------------------------------------------------
-- deep_dive_partner_responses — the partner's half (read → mirror → validate → respond)
-- ---------------------------------------------------------------------------
-- One row per journey (only the partner responds). Kept separate from `state`
-- because it is written by the OTHER user, and the journey owner should see it
-- appear step by step.
CREATE TABLE IF NOT EXISTS deep_dive_partner_responses (
  journey_id    UUID PRIMARY KEY REFERENCES deep_dive_journeys(id) ON DELETE CASCADE,
  responder_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  mirror        TEXT,
  -- { knew_now, didnt_know, want_you_to_know }
  validation    JSONB,
  response      TEXT,
  status        VARCHAR(16) NOT NULL DEFAULT 'reading',

  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT deep_dive_partner_responses_status_valid
    CHECK (status IN ('reading', 'mirrored', 'validated', 'responded'))
);

-- ---------------------------------------------------------------------------
-- updated_at triggers (029/083 convention)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_deep_dive_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_deep_dive_journeys_updated_at ON deep_dive_journeys;
CREATE TRIGGER trigger_update_deep_dive_journeys_updated_at
    BEFORE UPDATE ON deep_dive_journeys
    FOR EACH ROW
    EXECUTE FUNCTION update_deep_dive_updated_at();

DROP TRIGGER IF EXISTS trigger_update_deep_dive_letters_updated_at ON deep_dive_letters;
CREATE TRIGGER trigger_update_deep_dive_letters_updated_at
    BEFORE UPDATE ON deep_dive_letters
    FOR EACH ROW
    EXECUTE FUNCTION update_deep_dive_updated_at();

DROP TRIGGER IF EXISTS trigger_update_deep_dive_partner_responses_updated_at ON deep_dive_partner_responses;
CREATE TRIGGER trigger_update_deep_dive_partner_responses_updated_at
    BEFORE UPDATE ON deep_dive_partner_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_deep_dive_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (063 convention: enabled, zero policies)
-- ---------------------------------------------------------------------------
-- Backend connects as a rolbypassrls role; enabling RLS with no policies locks
-- the Supabase anon key out while the app keeps working. Authorization is
-- application-level via assertJourneyAccess in lib/deepDiveAccess.js.
ALTER TABLE deep_dive_journeys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_dive_letters           ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_dive_partner_responses ENABLE ROW LEVEL SECURITY;
