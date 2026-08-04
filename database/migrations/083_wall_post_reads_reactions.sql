-- "Our Wall" read receipts + one-tap acknowledgements.
--
-- Why both in one migration: a read indicator on its own turns "I don't know if
-- TA saw it" into "TA saw it and said nothing" (已讀不回), which is the more
-- painful version of the same loneliness. The read signal only ships alongside
-- a zero-effort way for the reader to respond, so the two tables arrive together.
--
-- Side tables rather than columns on wall_posts, mirroring wall_post_media (078).

CREATE TABLE IF NOT EXISTS wall_post_reads (
  post_id UUID NOT NULL REFERENCES wall_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wall_post_reads_post ON wall_post_reads(post_id);

-- One reaction per person per post: tapping a different chip replaces it,
-- tapping the active chip clears it. Keeps the card compact (no emoji pile-up).
-- `reaction` stores the KEY ('hug'/'understand'/'thanks'/'later') — never the
-- emoji or the zh-TW label — so copy can change without a data migration. The
-- whitelist lives in WALL_REACTIONS (routes/wall.js), not in a CHECK, so adding
-- a chip doesn't need a migration.
CREATE TABLE IF NOT EXISTS wall_post_reactions (
  post_id UUID NOT NULL REFERENCES wall_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction VARCHAR(16) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wall_post_reactions_post ON wall_post_reactions(post_id);

-- Migration 063 enabled RLS on every table that existed then, to lock the
-- Supabase PostgREST/anon path (the backend connects as `postgres` and bypasses
-- RLS, so no policies are needed). New tables have to opt in themselves.
ALTER TABLE wall_post_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE wall_post_reactions ENABLE ROW LEVEL SECURITY;
