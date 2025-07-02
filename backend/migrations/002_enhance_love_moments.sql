-- Migration 002: Enhance love_moments table with additional fields
-- Adding support for photos, descriptions, duration, location, and roleplay scripts

-- Add new columns to love_moments table
ALTER TABLE love_moments 
ADD COLUMN description TEXT,
ADD COLUMN duration VARCHAR(100),
ADD COLUMN location VARCHAR(200),
ADD COLUMN roleplay_script VARCHAR(100),
ADD COLUMN photo_id UUID,
ADD FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE SET NULL;

-- Create index for photo_id lookups
CREATE INDEX IF NOT EXISTS idx_love_moments_photo ON love_moments(photo_id);

-- Create index for roleplay script queries
CREATE INDEX IF NOT EXISTS idx_love_moments_roleplay ON love_moments(roleplay_script);

-- Update the existing records to have NULL values for new fields (already done by ALTER TABLE)
-- This migration is backward compatible 