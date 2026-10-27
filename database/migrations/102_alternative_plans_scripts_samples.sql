-- 替代方案協商, round 2 — upgrades the 101 schema in place.
--
-- 101 shipped to staging first; later changes were briefly folded into 101
-- itself, which an already-migrated DB never re-runs (the migrator tracks
-- versions only). Everything after the first 101 lives here, written to be
-- idempotent so it converges from either flavor of 101.
--
-- 1. Plans can be built on a roleplay script: script_id / script_title /
--    script_scenario snapshot the chosen script so the card can name it and
--    deep-link to it even if it's later renamed. A plan needs a description,
--    a script, or both.
-- 2. 偏好與界線 / 需要先確認的條件 are dropped (too much to type, dampened the mood).
-- 3. 示範方案 become admin-managed (/admin →「替代方案範例」); *_en columns serve
--    the English UI and fall back to 繁中 when blank.
-- 4. A 替代方案協商 invitation can point at the shared plans the sender wants
--    to talk about (intimacy_requests.alt_plan_ids).

ALTER TABLE intimacy_alternative_plans ADD COLUMN IF NOT EXISTS script_id VARCHAR(128);
ALTER TABLE intimacy_alternative_plans ADD COLUMN IF NOT EXISTS script_title VARCHAR(200);
ALTER TABLE intimacy_alternative_plans ADD COLUMN IF NOT EXISTS script_scenario TEXT;
ALTER TABLE intimacy_alternative_plans ALTER COLUMN interaction DROP NOT NULL;
ALTER TABLE intimacy_alternative_plans DROP COLUMN IF EXISTS boundaries;
ALTER TABLE intimacy_alternative_plans DROP COLUMN IF EXISTS conditions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alt_plan_has_content'
  ) THEN
    ALTER TABLE intimacy_alternative_plans
      ADD CONSTRAINT alt_plan_has_content CHECK (interaction IS NOT NULL OR script_title IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS alternative_plan_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  title_en VARCHAR(100),
  interaction TEXT,
  interaction_en TEXT,
  time_prep TEXT,
  time_prep_en TEXT,
  script_id VARCHAR(128),
  script_title VARCHAR(200),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO alternative_plan_samples
  (title, title_en, interaction, interaction_en, time_prep, time_prep_en, script_id, script_title, sort_order)
SELECT * FROM (VALUES
  (
    '慢慢來的親密夜', 'A slow, close night',
    '先幫對方做一段精油按摩，從肩頸慢慢到全身，再依偎擁抱；只進行我們事先都說好、也都喜歡的親密方式。',
    'Start with an aromatherapy oil massage, from the shoulders slowly to the whole body, then cuddle. Only the kinds of intimacy we both agreed on and both enjoy.',
    '約 1 小時。準備按摩精油和大毛巾，先洗澡、調暗燈光、手機開靜音。',
    'About an hour. Get massage oil and a big towel ready, shower first, dim the lights, phones on silent.',
    NULL, NULL, 1
  ),
  (
    '週末劇本之夜：初次相遇', 'Weekend script night: first meeting',
    '照劇本《初次相遇》演出：把客廳佈置成咖啡廳，從陌生人搭話的對白開始，跟著劇情慢慢熟悉彼此。',
    'Play the script "First meeting": turn the living room into a café, start with the strangers'' opening lines and let the plot bring you closer.',
    '約 90 分鐘。準備兩個咖啡杯、背景音樂和各自的角色服裝。',
    'About 90 minutes. Prepare two coffee cups, some background music and an outfit for each role.',
    'first-meeting', '初次相遇', 2
  )
) AS seed(title, title_en, interaction, interaction_en, time_prep, time_prep_en, script_id, script_title, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM alternative_plan_samples);

ALTER TABLE intimacy_requests ADD COLUMN IF NOT EXISTS alt_plan_ids UUID[];
