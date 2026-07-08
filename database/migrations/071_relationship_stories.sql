-- 真實故事 (Relationship Wisdom Archive): user-authored, publicly readable
-- stories following a fixed guided template. Cross-couple engagement (votes,
-- comments), read counts, post-moderation via reports + admin hide.
-- Stories are USER-scoped (unpaired users can author too — playbook §6 Q2).

CREATE TABLE IF NOT EXISTS relationship_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  -- One denormalized TEXT column per fixed template section. Kept as columns
  -- (not JSONB) so ILIKE search works today and tsvector is a clean upgrade.
  section_context  TEXT NOT NULL,  -- 背景
  section_happened TEXT NOT NULL,  -- 發生了什麼（當時的話或行為）
  section_impact   TEXT NOT NULL,  -- 情緒衝擊
  section_tried    TEXT NOT NULL,  -- 我們試過什麼（失敗與成功）
  section_repair   TEXT NOT NULL,  -- 轉捩點／有效的修復
  section_now      TEXT NOT NULL,  -- 現在的我們＋學到的事
  tags TEXT[] NOT NULL DEFAULT '{}',
  -- Anonymity snapshot at publish time: a later settings flip must not
  -- retroactively de-anonymize (or re-anonymize) old stories.
  show_nickname BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(16) NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden', 'deleted')),
  view_count INTEGER NOT NULL DEFAULT 0,
  -- { insights: [{title, body} x3], generatedAt } — generated once at publish;
  -- the row itself is the cache.
  ai_insights JSONB,
  -- Publish-time LLM toxicity pre-check output (same enum as event flags);
  -- non-empty = shows up in the admin review queue. Never blocks publishing.
  toxicity_flags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_status_created
  ON relationship_stories(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_author ON relationship_stories(author_id);
CREATE INDEX IF NOT EXISTS idx_stories_tags ON relationship_stories USING GIN(tags);

CREATE OR REPLACE FUNCTION update_relationship_stories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_relationship_stories_updated_at ON relationship_stories;
CREATE TRIGGER trigger_update_relationship_stories_updated_at
  BEFORE UPDATE ON relationship_stories
  FOR EACH ROW EXECUTE FUNCTION update_relationship_stories_updated_at();

-- Cross-couple comments: any signed-in user may comment on a published story.
CREATE TABLE IF NOT EXISTS story_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES relationship_stories(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_story_comments_story ON story_comments(story_id, created_at);

-- Three toggleable vote types per user per story.
CREATE TABLE IF NOT EXISTS story_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES relationship_stories(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote_type VARCHAR(16) NOT NULL CHECK (vote_type IN ('helpful', 'resonate', 'repair_worked')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(story_id, voter_id, vote_type)
);
CREATE INDEX IF NOT EXISTS idx_story_votes_story ON story_votes(story_id);
-- 本週精選 is computed at query time over the trailing 7 days.
CREATE INDEX IF NOT EXISTS idx_story_votes_created ON story_votes(created_at);

-- Logged-in read dedupe: each user counts once per story, forever.
CREATE TABLE IF NOT EXISTS story_views (
  story_id UUID NOT NULL REFERENCES relationship_stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

-- Reports target a story XOR a comment (mirrors script_reports, migration 037).
CREATE TABLE IF NOT EXISTS story_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES relationship_stories(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES story_comments(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(32) NOT NULL CHECK (reason IN ('inappropriate', 'spam', 'privacy', 'other')),
  detail TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK (num_nonnulls(story_id, comment_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_story_reports_story
  ON story_reports(story_id, reporter_user_id) WHERE story_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_story_reports_comment
  ON story_reports(comment_id, reporter_user_id) WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_story_reports_status ON story_reports(status, created_at DESC);
