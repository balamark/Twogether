-- Migration to move photos from database BLOB storage to Supabase Storage
-- This removes the binary data columns and adds a URL field

-- Add URL column for Supabase storage
ALTER TABLE photos ADD COLUMN storage_url TEXT;

-- Remove the binary data columns (we'll do this in steps for safety)
-- First, make them nullable
ALTER TABLE photos ALTER COLUMN photo_data DROP NOT NULL;
ALTER TABLE photos ALTER COLUMN file_size DROP NOT NULL;
ALTER TABLE photos ALTER COLUMN mime_type DROP NOT NULL;

-- We'll keep the columns for now and drop them in a future migration
-- after confirming all photos are migrated to Supabase

-- Update file_path to indicate Supabase storage
-- This will be used temporarily during migration
UPDATE photos SET file_path = 'supabase://pending' WHERE file_path LIKE 'db://%'; 