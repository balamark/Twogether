-- Add pending_conflicts column for storing merge conflicts during pairing
ALTER TABLE couples
  ADD COLUMN IF NOT EXISTS pending_conflicts JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN couples.pending_conflicts IS 'Merge conflicts from pre-pair journey data';
