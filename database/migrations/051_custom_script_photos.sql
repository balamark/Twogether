-- Custom scripts can now carry a series of up to 30 photos (not just one
-- thumbnail). The script detail lightbox pages through them left/right.
--
-- custom_scripts.thumbnail_url stays as the cover image (sort_order 0) for the
-- grid/marketplace and for backward compatibility; the full ordered series
-- lives here.
CREATE TABLE IF NOT EXISTS custom_script_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES custom_scripts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_script_photos_script
  ON custom_script_photos(script_id, sort_order);
