-- Roleplay invitations carry the chosen script's title + scenario (簡介) so
-- the recipient knows which script the in-character message belongs to and
-- can jump straight to it. Previously only roleplay_category was stored.
ALTER TABLE intimacy_requests ADD COLUMN IF NOT EXISTS script_title VARCHAR(200);
ALTER TABLE intimacy_requests ADD COLUMN IF NOT EXISTS script_scenario TEXT;

COMMENT ON COLUMN intimacy_requests.script_title IS
  'Roleplay script title the invitation refers to (also the deep-link key for 查看劇本).';
COMMENT ON COLUMN intimacy_requests.script_scenario IS
  'Short scenario/summary of the script, shown to the recipient for context.';
