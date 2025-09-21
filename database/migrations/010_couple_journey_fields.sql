-- Add journey/milestone fields to couples
ALTER TABLE couples
  ADD COLUMN IF NOT EXISTS first_date DATE,
  ADD COLUMN IF NOT EXISTS first_kiss_date DATE,
  ADD COLUMN IF NOT EXISTS first_kiss_place TEXT,
  ADD COLUMN IF NOT EXISTS first_intimacy_place TEXT;


