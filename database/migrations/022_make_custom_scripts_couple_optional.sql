-- Make couple_id optional in custom_scripts to allow personal scripts
ALTER TABLE custom_scripts
ALTER COLUMN couple_id DROP NOT NULL;

-- Add comment to explain the nullable couple_id
COMMENT ON COLUMN custom_scripts.couple_id IS 'Couple ID - can be NULL for personal scripts created before pairing';
