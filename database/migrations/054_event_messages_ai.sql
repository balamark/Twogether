-- 衝突事件 threads can now include AI 諮商師 (counselor) messages, mirroring the
-- wall (052). Stored as normal event_messages (sender_id = the partner who
-- invited the AI, so existing access / read rules keep working) but flagged so
-- the UI renders them distinctly.

ALTER TABLE event_messages
  ADD COLUMN IF NOT EXISTS is_ai BOOLEAN NOT NULL DEFAULT FALSE;
