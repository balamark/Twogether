-- Private wall posts: a post can be marked "only I can see it" so the partner
-- neither sees it in their wall nor gets notified about it. Default false keeps
-- every existing post shared, matching current behavior.
ALTER TABLE wall_posts
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
