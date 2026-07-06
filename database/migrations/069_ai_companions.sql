-- AI therapist personalization: each user picks a named AI companion whose
-- persona shapes counselor replies. NULL selected_therapist = not chosen yet
-- (drives the one-time onboarding picker); generation falls back to 'luma'.
-- AI messages record which companion wrote them so past conversations keep
-- their original attribution after the user switches companions.
ALTER TABLE users              ADD COLUMN IF NOT EXISTS selected_therapist VARCHAR(20);
ALTER TABLE event_messages     ADD COLUMN IF NOT EXISTS ai_therapist VARCHAR(20);
ALTER TABLE wall_post_replies  ADD COLUMN IF NOT EXISTS ai_therapist VARCHAR(20);
