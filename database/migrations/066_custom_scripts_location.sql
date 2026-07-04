-- Scenario location for roleplay scripts (issue #25): a filterable "where does
-- this take place" dimension (教室、辦公室、家裡、飯店…), separate from the
-- free-text scenario description.
ALTER TABLE custom_scripts ADD COLUMN IF NOT EXISTS location VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_custom_scripts_location ON custom_scripts(location);

COMMENT ON COLUMN custom_scripts.location IS
  'Scenario location (場景地點) used for library/marketplace filtering; free text with suggested common values.';

-- Recreate the marketplace view with the new column. CREATE OR REPLACE VIEW
-- only permits appending columns, so `location` goes last (the route maps by
-- name, not position).
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
  COALESCE(r.rating_count, 0)::int AS rating_count,
  s.location
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
