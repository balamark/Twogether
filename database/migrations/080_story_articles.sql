-- 好文 · 故事: merge 閱讀 (curated reading) + 智慧故事 into one surface and let
-- users share a good article they found. A `kind` discriminator lets plain-text
-- articles ride the SAME engagement machinery as guided stories (list, detail,
-- votes, comments, views, reports, moderation, 我的故事, 本週精選) — no new tables.
-- Existing rows are all kind='story' with the six sections present, so the
-- kind-aware CHECK is satisfied at migration time.

ALTER TABLE relationship_stories
  ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'story'
    CHECK (kind IN ('story','article')),
  ADD COLUMN IF NOT EXISTS body TEXT,                  -- plain-text article body (verbatim)
  ADD COLUMN IF NOT EXISTS source_url TEXT,            -- optional attribution link
  ADD COLUMN IF NOT EXISTS source_author VARCHAR(120); -- optional original author / publication

-- Guided-story sections become optional so article rows can leave them NULL.
ALTER TABLE relationship_stories
  ALTER COLUMN section_context  DROP NOT NULL,
  ALTER COLUMN section_happened DROP NOT NULL,
  ALTER COLUMN section_impact   DROP NOT NULL,
  ALTER COLUMN section_tried    DROP NOT NULL,
  ALTER COLUMN section_repair   DROP NOT NULL,
  ALTER COLUMN section_now      DROP NOT NULL;

-- Kind-aware shape: stories still require all six sections; articles require a
-- non-empty body. Named so it can be dropped cleanly in a future migration.
ALTER TABLE relationship_stories
  DROP CONSTRAINT IF EXISTS chk_story_shape;
ALTER TABLE relationship_stories
  ADD CONSTRAINT chk_story_shape CHECK (
    (kind = 'story' AND section_context IS NOT NULL AND section_happened IS NOT NULL
       AND section_impact IS NOT NULL AND section_tried IS NOT NULL
       AND section_repair IS NOT NULL AND section_now IS NOT NULL)
    OR
    (kind = 'article' AND body IS NOT NULL AND length(btrim(body)) > 0)
  );

-- Kind-scoped browsing / featured filtering.
CREATE INDEX IF NOT EXISTS idx_stories_kind_status_created
  ON relationship_stories(kind, status, created_at DESC);
