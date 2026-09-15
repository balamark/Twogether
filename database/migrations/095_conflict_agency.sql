-- Sophie 衝突即時介入 — the agency / retaliation intervention.
--
-- Sophie's highest-level move: when a held message comes from the urge to hit
-- back, she does NOT ask the user to forgive or "understand each other". She
-- names the urge, hands the user back control ("我不把我的行為控制權交給你的情緒"),
-- and asks the pivotal question — do you want to HURT them, or to finally be
-- UNDERSTOOD? These two fields record that choice so we can learn how often the
-- real answer is "I just want them to know how hurt I am" (P2 pattern work).

ALTER TABLE conflict_interventions
  -- What the user said they wanted in the moment: fight (吵到底) /
  -- stop (先停下來) / be_understood (只是想讓他知道我有多受傷).
  ADD COLUMN IF NOT EXISTS agency_intent VARCHAR(16)
    CHECK (agency_intent IN ('fight','stop','be_understood') OR agency_intent IS NULL),
  -- Only asked after "fight": the goal underneath the fight — hurt (讓他受傷) /
  -- understand (讓他終於理解我).
  ADD COLUMN IF NOT EXISTS agency_goal VARCHAR(16)
    CHECK (agency_goal IN ('hurt','understand') OR agency_goal IS NULL);
