-- 我們的故事 — the couple's shared story timeline, persisted so it syncs across
-- both partners' devices and survives a browser clear (it previously lived only
-- in localStorage).
--
-- Two kinds of row share the table:
--   • 'story'  — a milestone the couple added themselves (孩子出生, 第一次旅行…),
--                carrying its own emoji/title/date/place/description.
--   • 'enrich' — extras (photo + the two reflections) layered onto a *base*
--                milestone whose core fields are owned elsewhere (client presets
--                / 設定); identified by base_ref. One enrich row per base id.
--
-- owner_scope is the couple id when paired, else the user id, so a solo user can
-- still build their story and it becomes shared the moment they pair under that
-- couple id. Photos are stored as downscaled JPEG data URLs (the client shrinks
-- them first) — a pragmatic keepsake store, size-capped in the route.

CREATE TABLE IF NOT EXISTS journey_milestones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_scope  VARCHAR(64) NOT NULL,
  kind         VARCHAR(16) NOT NULL DEFAULT 'story' CHECK (kind IN ('story', 'enrich')),
  base_ref     VARCHAR(64),                 -- set only for kind='enrich'
  emoji        VARCHAR(16),
  title        TEXT,
  event_date   DATE,
  place        TEXT,
  description  TEXT,
  photo_url    TEXT,                         -- downscaled data URL (or null)
  liked_then   TEXT,                         -- 當時，我喜歡你的一個地方
  realize_now  TEXT,                         -- 現在回頭看，我才發現…
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_milestones_owner
  ON journey_milestones (owner_scope);

-- At most one enrich row per (scope, base milestone).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_journey_enrich
  ON journey_milestones (owner_scope, base_ref)
  WHERE kind = 'enrich';
