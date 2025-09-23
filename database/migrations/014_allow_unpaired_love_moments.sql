-- Migration: Allow unpaired users to create love moments
-- This allows users to record intimate moments even before pairing
-- When they pair later, their existing records will be preserved

-- Make couple_id nullable in love_moments table
ALTER TABLE love_moments
DROP CONSTRAINT love_moments_couple_id_fkey,
ALTER COLUMN couple_id DROP NOT NULL;

-- Add the foreign key constraint back, but allow nulls
ALTER TABLE love_moments
ADD CONSTRAINT love_moments_couple_id_fkey
FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE SET NULL;

-- Update other tables that depend on couple_id to be nullable as well
-- (for consistency, though they may not need it immediately)

-- Make couple_id nullable in achievements table
ALTER TABLE achievements
DROP CONSTRAINT achievements_couple_id_fkey,
ALTER COLUMN couple_id DROP NOT NULL;

ALTER TABLE achievements
ADD CONSTRAINT achievements_couple_id_fkey
FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE SET NULL;

-- Make couple_id nullable in coin_transactions table
ALTER TABLE coin_transactions
DROP CONSTRAINT coin_transactions_couple_id_fkey,
ALTER COLUMN couple_id DROP NOT NULL;

ALTER TABLE coin_transactions
ADD CONSTRAINT coin_transactions_couple_id_fkey
FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE SET NULL;

-- Make couple_id nullable in photos table
ALTER TABLE photos
DROP CONSTRAINT photos_couple_id_fkey,
ALTER COLUMN couple_id DROP NOT NULL;

ALTER TABLE photos
ADD CONSTRAINT photos_couple_id_fkey
FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE SET NULL;