-- Migration: Add missing columns to love_moments table
-- This migration adds coins_earned and activity_type columns

-- Add coins_earned column to love_moments table
ALTER TABLE love_moments 
ADD COLUMN coins_earned INTEGER DEFAULT 0;

-- Add activity_type column to love_moments table
ALTER TABLE love_moments 
ADD COLUMN activity_type VARCHAR(50) DEFAULT 'regular';

-- Create index for activity_type queries
CREATE INDEX idx_love_moments_activity_type ON love_moments(activity_type);

-- Create index for coins_earned queries
CREATE INDEX idx_love_moments_coins_earned ON love_moments(coins_earned); 