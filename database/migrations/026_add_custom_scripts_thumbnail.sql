-- Add optional thumbnail image URL to custom_scripts
ALTER TABLE custom_scripts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN custom_scripts.thumbnail_url IS
  'Public Supabase Storage URL for the user-uploaded thumbnail. Nullable.';
