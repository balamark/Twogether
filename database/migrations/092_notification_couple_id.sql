-- Give notifications an optional couple_id so a notification can point at a
-- specific couple, not just a user. This lets the 諮商師 notification
-- "有伴侶把你設為專屬諮商師" (dedicated_client_added) deep-link the counselor
-- straight to THAT couple's page in 我輔導的伴侶 — instead of guessing "the most
-- recently added client". Nullable: existing rows and notification types that
-- aren't about a couple simply leave it NULL.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS couple_id UUID REFERENCES couples(id) ON DELETE CASCADE;
