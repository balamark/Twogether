-- Allow single-user couples by making user2_id nullable
-- This enables users to create couples without requiring a partner initially

-- Drop the existing constraint that requires user1_id != user2_id
ALTER TABLE couples DROP CONSTRAINT IF EXISTS couples_check;

-- Make user2_id nullable
ALTER TABLE couples ALTER COLUMN user2_id DROP NOT NULL;

-- Add a new constraint that allows user2_id to be NULL or different from user1_id
ALTER TABLE couples ADD CONSTRAINT couples_single_or_different_users_check 
CHECK (user2_id IS NULL OR user1_id <> user2_id);

-- Update the unique constraint to handle NULL values properly
-- Drop the existing unique constraint
ALTER TABLE couples DROP CONSTRAINT IF EXISTS couples_user1_id_user2_id_key;

-- Add a new unique constraint that treats NULL user2_id as allowing multiple entries for same user1_id
-- Note: This is more complex and may require application-level uniqueness checks
-- For now, we'll just remove the constraint and handle uniqueness in the application code 