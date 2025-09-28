-- Migration: Add first_meet_date column and fix date mapping
-- This separates meeting date from anniversary date for better clarity

-- Add first_meet_date field to couples table
ALTER TABLE couples ADD COLUMN IF NOT EXISTS first_meet_date DATE;

-- Migrate existing anniversary_date to first_meet_date if it seems to be a meeting date
-- and clear anniversary_date for proper remapping
UPDATE couples
SET first_meet_date = anniversary_date
WHERE anniversary_date IS NOT NULL
  AND first_date IS NULL;

-- Clear anniversary_date for couples that had it set but no first_date
-- This allows users to properly set both dates
UPDATE couples
SET anniversary_date = NULL
WHERE first_meet_date IS NOT NULL;

-- Add index for new field
CREATE INDEX IF NOT EXISTS idx_couples_first_meet_date ON couples(first_meet_date);