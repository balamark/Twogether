-- Phase 2 of the reflection judge: let admins promote a real user down-vote into
-- a negative few-shot example for the LLM judge.
--
-- Only ADMIN-curated rows ever reach the judge prompt, and only the AI's own
-- prior output (message_text) plus an admin-authored note (curated_note) — never
-- the raw user feedback_text, which is untrusted free text and a prompt-injection
-- risk. curated_note is the single free-text field allowed into the judge, and it
-- is authored by an admin during curation.
--
-- No curated_by column: adminAuth is a shared-password Basic gate that injects no
-- admin identity, so there is nobody to attribute the action to.
ALTER TABLE ai_response_feedback
  ADD COLUMN IF NOT EXISTS curated_negative BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS curated_note TEXT,
  ADD COLUMN IF NOT EXISTS curated_at TIMESTAMP WITH TIME ZONE;

-- The judge's "load curated examples for this surface" query, newest first.
CREATE INDEX IF NOT EXISTS idx_ai_response_feedback_curated
  ON ai_response_feedback (surface, curated_at DESC)
  WHERE curated_negative;
