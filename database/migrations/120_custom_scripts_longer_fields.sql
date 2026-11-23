-- Widen the custom_scripts columns that are shorter than the marketplace
-- bot upload limits (lib/marketplaceBotScript.js LIMITS, tripled).
-- scenario, content, thumbnail_url, and tags are already TEXT / JSONB.
--
-- title, location, and duration are selected by marketplace_scripts_view, and
-- PostgreSQL refuses to change a column type while a view uses it. Drop the
-- view, widen the columns, then recreate the view from migration 066.
--
-- No new table, so no new RLS statement: custom_scripts already has row
-- level security (migrations 063 / 110). This only widens existing columns.

DROP VIEW IF EXISTS marketplace_scripts_view;

ALTER TABLE custom_scripts
  ALTER COLUMN title TYPE VARCHAR(300),
  ALTER COLUMN location TYPE VARCHAR(150),
  ALTER COLUMN duration TYPE VARCHAR(150),
  ALTER COLUMN source_key TYPE VARCHAR(360);

CREATE VIEW marketplace_scripts_view AS
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
