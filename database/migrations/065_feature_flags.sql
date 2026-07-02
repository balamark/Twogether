-- Feature flags: a tiny admin-controlled on/off registry so we can ship UI
-- behind a gate and flip it from the /admin dashboard without a deploy. The
-- first flag, `show_weekly_average`, hides the「周平均」stat card on 記錄時光
-- by default; admins can switch it on to A/B-try the metric. Built generic so
-- future UI experiments reuse the same table + admin toggle + public read.

CREATE TABLE IF NOT EXISTS feature_flags (
  key         VARCHAR(64) PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  label       VARCHAR(120) NOT NULL,
  description TEXT,
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Lock the table to the app's bypass role only (the app reads/writes via the
-- Node backend, never the public PostgREST/anon API). Matches migration 063's
-- policy; done here because this table is created after 063.
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

INSERT INTO feature_flags (key, enabled, label, description)
VALUES (
  'show_weekly_average',
  false,
  '周平均統計卡片',
  '在「記錄時光」顯示親密次數的周平均統計卡片。預設關閉，可在此開啟試用。'
)
ON CONFLICT (key) DO NOTHING;
