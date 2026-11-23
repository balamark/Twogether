-- External id for the marketplace bot (POST /api/bot/marketplace/scripts).
-- Re-sending the same source_key updates that row instead of inserting another
-- public script. NULL for scripts created in the app; a unique index still
-- allows many NULLs.
--
-- No new table, so no new RLS statement: custom_scripts already has row level
-- security (migrations 063 / 110). This only adds a column.

ALTER TABLE custom_scripts
  ADD COLUMN IF NOT EXISTS source_key VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_scripts_source_key
  ON custom_scripts (source_key)
  WHERE source_key IS NOT NULL;

COMMENT ON COLUMN custom_scripts.source_key IS
  'Optional external id from the marketplace bot (e.g. 2026-11-23-JUR-925). Unique when set; re-uploads update this row instead of duplicating it.';
