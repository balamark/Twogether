-- Sophie 衝突即時介入 — move the intervention into the 說開一件事 (event) thread.
--
-- The intervention now fires from the event reply box: a heated reply is held,
-- Sophie runs the intervention, and on release the ORIGINAL words are posted as
-- a normal message in that event thread — with Sophie's translation shown inline
-- beneath it (independent of the per-thread 情緒翻譯 lens toggle).

-- Tie a held reply to the thread it belongs to. Nullable so the standalone
-- (non-thread) path still works.
ALTER TABLE conflict_interventions
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_conflict_interventions_event
  ON conflict_interventions (event_id);

-- Sophie's translation, carried on the released message itself so it renders in
-- the thread whether or not the couple has the 情緒翻譯 lens turned on. Only set
-- on a message that came from a completed (confirmed) intervention.
ALTER TABLE event_messages
  ADD COLUMN IF NOT EXISTS sophie_translation TEXT,
  ADD COLUMN IF NOT EXISTS sophie_need TEXT;
