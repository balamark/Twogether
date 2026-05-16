-- "Our Wall" — free-form notes/moods shared between a couple,
-- with threaded replies. Mirrors custom_scripts (couple-scoped) for
-- ownership and lifecycle.

CREATE TABLE IF NOT EXISTS wall_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
    mood_tag VARCHAR(32),
    category VARCHAR(16) NOT NULL DEFAULT 'general'
        CHECK (category IN ('important', 'general')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wall_posts_couple_id ON wall_posts(couple_id);
CREATE INDEX IF NOT EXISTS idx_wall_posts_author_id ON wall_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_wall_posts_created_at ON wall_posts(created_at DESC);

CREATE TABLE IF NOT EXISTS wall_post_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES wall_posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wall_post_replies_post_id
    ON wall_post_replies(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wall_post_replies_author_id
    ON wall_post_replies(author_id);

CREATE OR REPLACE FUNCTION update_wall_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_wall_posts_updated_at ON wall_posts;
CREATE TRIGGER trigger_update_wall_posts_updated_at
    BEFORE UPDATE ON wall_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_wall_posts_updated_at();
