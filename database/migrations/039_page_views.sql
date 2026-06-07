-- Per-view tracking for the /admin Pages and Retention tabs.
--
-- Each row represents a COMPLETED view-visit: the client inserts on exit
-- (or via navigator.sendBeacon on tab close), not on entry. That keeps the
-- backend insert-only (no UPDATE path) and avoids zombie rows from tabs that
-- crashed before any exit signal.
--
-- view_type splits 'view' (nav tabs like 'record', 'roleplay') from
-- 'modal' ('modal:record', 'modal:auth') so the dashboard can present them
-- separately or together.

CREATE TABLE IF NOT EXISTS page_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  view        TEXT NOT NULL,
  view_type   TEXT NOT NULL,
  session_id  UUID,
  entered_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_ms INTEGER,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_user_entered
  ON page_views(user_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_views_view_entered
  ON page_views(view, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_views_entered_at
  ON page_views(entered_at DESC);
