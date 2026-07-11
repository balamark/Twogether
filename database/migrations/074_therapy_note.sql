-- Post-conflict Therapy Note ("治療摘要").
--
-- When a couple resolves an event, we generate a structured therapy note once
-- (biggest trigger, each side's real need, the negative cycle, what repair
-- worked, a next-time opening line) and store it on the event. It is shared to
-- both partners and immutable once written, so a single JSONB column on the
-- event is the natural home: the first partner to open the resolved event
-- triggers generation, and both then read the same stored note for free.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS therapy_note JSONB;
