-- Per-couple roleplay script favorites. Same script_id space holds both
-- built-in default script ids (e.g. 'fan-idol-backstage') and custom_scripts
-- UUIDs, so script_id is VARCHAR.
CREATE TABLE IF NOT EXISTS script_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
    script_id VARCHAR(100) NOT NULL,
    favorited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Two partial unique indexes (instead of NULLS NOT DISTINCT, which needs
-- PG 15+) to dedupe per-couple favorites and per-user favorites for
-- unpaired users.
CREATE UNIQUE INDEX IF NOT EXISTS idx_script_favorites_couple_unique
    ON script_favorites(couple_id, script_id)
    WHERE couple_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_script_favorites_user_unique
    ON script_favorites(favorited_by, script_id)
    WHERE couple_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_script_favorites_couple
    ON script_favorites(couple_id);
CREATE INDEX IF NOT EXISTS idx_script_favorites_user
    ON script_favorites(favorited_by);
