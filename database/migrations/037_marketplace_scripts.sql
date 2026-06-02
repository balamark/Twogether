-- Marketplace: opt-in public sharing of custom_scripts + ratings + reports.
-- Favorites already exist (migration 030, script_favorites table — VARCHAR
-- script_id, couple-scoped). This migration only adds the missing pieces.

-- 1. is_public flag on custom_scripts.
--    Existing rows stay private (default false at column creation), then we
--    flip the default to true so future inserts that omit the field default to
--    "shared to marketplace" — the product requirement.
ALTER TABLE custom_scripts
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE custom_scripts
  ALTER COLUMN is_public SET DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_custom_scripts_public_created
  ON custom_scripts(created_at DESC)
  WHERE is_public = true;

-- 2. Ratings — one per (script, user). UPSERT keyed on UNIQUE constraint.
CREATE TABLE IF NOT EXISTS script_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES custom_scripts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(script_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_script_ratings_script
  ON script_ratings(script_id);
CREATE INDEX IF NOT EXISTS idx_script_ratings_user
  ON script_ratings(user_id);

-- updated_at trigger mirroring the pattern from 015_custom_scripts.sql.
CREATE OR REPLACE FUNCTION script_ratings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_script_ratings_updated_at ON script_ratings;
CREATE TRIGGER trg_script_ratings_updated_at
  BEFORE UPDATE ON script_ratings
  FOR EACH ROW EXECUTE FUNCTION script_ratings_set_updated_at();

-- 3. Reports — moderation queue. One report per (script, reporter).
CREATE TABLE IF NOT EXISTS script_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES custom_scripts(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(32) NOT NULL CHECK (reason IN ('inappropriate', 'spam', 'copyright', 'other')),
  detail TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(script_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_script_reports_status
  ON script_reports(status, created_at DESC);

-- 4. Marketplace view — public scripts joined with author nickname and
--    aggregate rating stats. Read-only convenience for list/detail queries.
CREATE OR REPLACE VIEW marketplace_scripts_view AS
SELECT
  s.id,
  s.couple_id,
  s.created_by,
  s.title,
  s.category,
  s.scenario,
  s.content,
  s.tags,
  s.duration,
  s.thumbnail_url,
  s.is_public,
  s.created_at,
  s.updated_at,
  COALESCE(u.nickname, '匿名作者') AS author_name,
  COALESCE(r.avg_stars, 0)::numeric(3,2) AS avg_stars,
  COALESCE(r.rating_count, 0)::int AS rating_count
FROM custom_scripts s
LEFT JOIN users u ON u.id = s.created_by
LEFT JOIN (
  SELECT script_id,
         AVG(stars)::numeric(3,2) AS avg_stars,
         COUNT(*) AS rating_count
  FROM script_ratings
  GROUP BY script_id
) r ON r.script_id = s.id
WHERE s.is_public = true;
