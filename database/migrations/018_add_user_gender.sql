-- Migration: Add gender field to users table for gender-aware roleplay scripts
-- This allows the system to assign appropriate character names in roleplay scenarios

-- Add gender field to users table
ALTER TABLE users ADD COLUMN gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other'));

-- Add index for gender field
CREATE INDEX idx_users_gender ON users(gender);

-- Update existing users to have default gender if needed
-- Note: This will be set by users through the UI, leaving NULL for now