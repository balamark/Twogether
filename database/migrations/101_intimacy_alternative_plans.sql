-- 替代方案協商 (Alternative Intimacy Options negotiation).
--
-- A new intimacy-request type, 'negotiation', invites the partner to talk about
-- what else both of you would enjoy when the originally hoped-for intimacy
-- can't happen right now. The talk produces co-authored plans stored here.
--
-- A plan is only on the couple's shared list once BOTH partners approved its
-- current wording. `approved_by` holds the user ids that approved the current
-- version; any edit resets it to just the editor, so the other partner must
-- re-approve what actually changed. Either partner can disable a plan at any
-- time (disabled_at). Status is derived:
--   disabled_at IS NOT NULL            → 'disabled' (已停用)
--   both partners in approved_by       → 'approved' (雙方已認可)
--   otherwise                          → 'pending'  (待確認)
-- Approval never obliges anyone to act on a plan — consent is re-checked every
-- time; the UI says so.
--
-- A plan's interaction can be a roleplay script: script_id / script_title /
-- script_scenario snapshot the chosen script (built-in, custom or marketplace)
-- so the card can name it and deep-link to it even if it's later renamed.

CREATE TABLE IF NOT EXISTS intimacy_alternative_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  -- The negotiation invitation this plan came out of (optional; plans can be
  -- added later straight from the shared list).
  request_id UUID REFERENCES intimacy_requests(id) ON DELETE SET NULL,
  title VARCHAR(100) NOT NULL,
  interaction TEXT,                 -- 具體的互動方式 (optional when a script is linked)
  time_prep TEXT,                   -- 預期投入的時間與準備
  script_id VARCHAR(128),
  script_title VARCHAR(200),
  script_scenario TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID[] NOT NULL DEFAULT '{}',
  -- Bumped on every content edit. Approve sends the revision it was shown, so
  -- an approval can never land on wording the partner changed in the meantime.
  revision INTEGER NOT NULL DEFAULT 1,
  disabled_at TIMESTAMP WITH TIME ZONE,
  disabled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT alt_plan_has_content CHECK (interaction IS NOT NULL OR script_title IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_intimacy_alt_plans_couple
  ON intimacy_alternative_plans(couple_id, updated_at DESC);

-- 示範方案: admin-managed (/admin →「替代方案範例」) examples shown in the empty
-- plan list and on the logged-out showroom. *_en columns serve the English UI
-- (fall back to 繁中 when blank).
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
