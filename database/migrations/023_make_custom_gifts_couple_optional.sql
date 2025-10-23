-- Make couple_id optional in custom_gifts to allow personal gifts
ALTER TABLE custom_gifts
ALTER COLUMN couple_id DROP NOT NULL;

-- Add comment to explain the nullable couple_id
COMMENT ON COLUMN custom_gifts.couple_id IS 'Couple ID - can be NULL for personal gifts created before pairing';
