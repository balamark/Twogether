-- Admin analytics: capture top-of-funnel landing visits and per-login events
-- so the /admin dashboard can report the signup funnel and return-rate without
-- relying on ephemeral GCP request logs.

-- 1. landing_visits — one row per logged-out homepage render (beacon from the
--    frontend). Frontend dedupes within a tab session via sessionStorage; we
--    keep raw rows here and let queries do COUNT(DISTINCT ip) for the funnel.
CREATE TABLE IF NOT EXISTS landing_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT,
  user_agent TEXT,
  visited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landing_visits_visited_at
  ON landing_visits(visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_visits_ip_visited_at
  ON landing_visits(ip, visited_at DESC);

-- 2. login_events — one row per successful login. Lets us compute "returning
--    users" (>=2 distinct login days) and per-user login_days count for the
--    recent-users table on the dashboard.
CREATE TABLE IF NOT EXISTS login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_events_user_logged_at
  ON login_events(user_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_events_logged_at
  ON login_events(logged_at DESC);
