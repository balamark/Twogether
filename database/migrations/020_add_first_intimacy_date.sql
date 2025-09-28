-- Migration: Add first_intimacy_date column
-- This adds a date field for the first intimacy experience to enable timeline display

-- Add first_intimacy_date field to couples table
ALTER TABLE couples ADD COLUMN IF NOT EXISTS first_intimacy_date DATE;

-- Add index for new field for better query performance
CREATE INDEX IF NOT EXISTS idx_couples_first_intimacy_date ON couples(first_intimacy_date);