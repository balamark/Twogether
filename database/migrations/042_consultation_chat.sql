-- Group chat for a consultation: the couple (both partners) + the therapist
-- talk in one room. Messages can reference a recorded "event" (events table)
-- so the conversation can be anchored to a specific past incident the couple
-- logged.
--
-- The "room" is the consultation row itself (therapist_consultations); this
-- table is just its message log. Who may read/post is computed in the route:
-- the requester, anyone in the consultation's couple, or the therapist's
-- linked user account.

CREATE TABLE IF NOT EXISTS consultation_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES therapist_consultations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  -- Optional anchor to a recorded event the couple is discussing. SET NULL so
  -- deleting the event doesn't erase the chat history.
  event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultation_messages_room
  ON consultation_messages(consultation_id, created_at);
