-- Sophie 衝突即時介入 — remember WHICH AI 諮商師 helped compose a mediated reply.
--
-- The "X 協助表達" label on a released message must show the SENDER's chosen
-- companion (Sophie / Emma / Kai / …), not a hard-coded name — and the partner
-- viewing it has no way to know the sender's pick, so it is stored on the
-- message at release time. Its display name only (no persona/prompt).
ALTER TABLE event_messages
  ADD COLUMN IF NOT EXISTS sophie_companion TEXT;
