-- 說開一件事：keep the whole of a long draft, not just the 3-sentence summary.
--
-- The icebreaker rewrite compresses the raw text into a title, a ≤200-char
-- factual `summary`, and three 1–4 sentence versions. That is the right shape
-- for a short vent, but a 1000–2000 character draft loses almost everything —
-- and the specifics that get dropped are exactly what the partner needs in
-- order to discuss the thing.
--
-- `detail` is the second panel: a full first-person rewrite that keeps every
-- point the writer raised (cleaned of attacks and absolutes), shown under the
-- summary. NULL for short drafts, which keep today's behaviour and cost.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS detail TEXT;
