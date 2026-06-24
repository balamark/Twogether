-- Let couples share a 衝突事件 thread or a 我們的牆 thread into the public 公開問答
-- browse (anonymised, read-only) so others can learn from it. Unlike therapist
-- consultations (045, two-party client+therapist handshake), this is the
-- couple's own content, so it's a single-party toggle with an explicit in-app
-- warning. Either partner can share or un-share.
--
--   public_status : 'private' (default) | 'published'
--   public_title  : headline shown in the public list
--   published_at  : when it went public (ordering + partial index)
--   published_by  : which partner shared it (history; SET NULL on delete)

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS public_status VARCHAR(16) NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS public_title  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS published_at  TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS published_by  UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_public_status_valid;
ALTER TABLE events ADD CONSTRAINT events_public_status_valid
  CHECK (public_status IN ('private', 'published'));

CREATE INDEX IF NOT EXISTS idx_events_published
  ON events(published_at DESC)
  WHERE public_status = 'published';

ALTER TABLE wall_posts
  ADD COLUMN IF NOT EXISTS public_status VARCHAR(16) NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS public_title  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS published_at  TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS published_by  UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE wall_posts DROP CONSTRAINT IF EXISTS wall_posts_public_status_valid;
ALTER TABLE wall_posts ADD CONSTRAINT wall_posts_public_status_valid
  CHECK (public_status IN ('private', 'published'));

CREATE INDEX IF NOT EXISTS idx_wall_posts_published
  ON wall_posts(published_at DESC)
  WHERE public_status = 'published';
