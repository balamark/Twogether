-- Wall thread replies can now include AI 諮商師 (counselor) mediator comments.
-- These are stored as normal replies (author_id = the partner who invited the
-- AI, so the existing JOIN users / own-reply delete rules keep working) but
-- flagged so the UI can render them distinctly.

ALTER TABLE wall_post_replies
  ADD COLUMN IF NOT EXISTS is_ai BOOLEAN NOT NULL DEFAULT FALSE;
