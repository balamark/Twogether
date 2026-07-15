-- "Our Wall" posts can now carry photos and videos (up to 4 per post), not just
-- text. Mirrors custom_script_photos (051): ordered media URLs in a side table,
-- videos detected client-side via isVideoUrl(). Media lives in Supabase Storage
-- under wall-photos/ and wall-videos/ prefixes; only the public URL is stored.
CREATE TABLE IF NOT EXISTS wall_post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES wall_posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wall_post_media_post
  ON wall_post_media(post_id, sort_order);

-- Allow media-only posts: a post with photos/videos may have empty text. The
-- original inline constraint (028) required content length BETWEEN 1 AND 2000;
-- relax the lower bound to 0 (column stays NOT NULL, so media-only posts store
-- an empty string). The inline column CHECK was auto-named wall_posts_content_check.
ALTER TABLE wall_posts DROP CONSTRAINT IF EXISTS wall_posts_content_check;
ALTER TABLE wall_posts
  ADD CONSTRAINT wall_posts_content_len_check CHECK (char_length(content) <= 2000);
