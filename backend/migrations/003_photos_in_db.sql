-- Migration to store photos as binary data in database
-- This replaces file-based storage with database BLOB storage

-- Add new columns for binary photo storage
ALTER TABLE photos ADD COLUMN photo_data BYTEA;
ALTER TABLE photos ADD COLUMN file_size INTEGER;
ALTER TABLE photos ADD COLUMN mime_type VARCHAR(100);

-- Update existing photo records (if any) to set default values
UPDATE photos SET 
    photo_data = decode('', 'base64'),
    file_size = 0,
    mime_type = 'image/jpeg'
WHERE photo_data IS NULL;

-- Make the new columns NOT NULL after setting defaults
ALTER TABLE photos ALTER COLUMN photo_data SET NOT NULL;
ALTER TABLE photos ALTER COLUMN file_size SET NOT NULL;
ALTER TABLE photos ALTER COLUMN mime_type SET NOT NULL;

-- The file_path column will remain for backward compatibility but won't be used
-- We can drop it in a future migration if needed 