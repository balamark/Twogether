-- Post-send editing: creators can amend event title/summary; senders can amend
-- their own thread messages. Track when so the UI can show 「已編輯」.
ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE events         ADD COLUMN IF NOT EXISTS content_edited_at TIMESTAMP WITH TIME ZONE;
