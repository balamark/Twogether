-- 真實情侶會怎麼做 (Community polls): open-ended relationship scenarios where
-- users vote among options AND can leave a short "心聲" (voice) explaining their
-- choice. A low-friction way for new/unpaired users to participate and generate
-- content. Polls are curated (seeded/admin-created), not user-created this round.

CREATE TABLE IF NOT EXISTS community_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question VARCHAR(200) NOT NULL,
  -- Optional scene-setting shown under the question.
  scenario TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(16) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  -- Curated ordering; higher = shown first, then newest.
  sort_weight INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_polls_status ON community_polls(status, sort_weight DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id, sort_order);

-- One vote per user per poll (changeable: re-voting moves the vote).
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(poll_id, voter_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON poll_votes(option_id);

-- "心聲": a short explanation of why the user chose what they chose. Optionally
-- linked to the option they picked so results can show representative voices.
CREATE TABLE IF NOT EXISTS poll_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  option_id UUID REFERENCES poll_options(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_poll_voices_poll ON poll_voices(poll_id, created_at DESC);

CREATE TABLE IF NOT EXISTS poll_voice_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id UUID NOT NULL REFERENCES poll_voices(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(32) NOT NULL CHECK (reason IN ('inappropriate', 'spam', 'privacy', 'other')),
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(voice_id, reporter_user_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_voice_reports_status ON poll_voice_reports(status, created_at DESC);

-- Seed open-ended scenario polls. Idempotent: only seed when empty.
INSERT INTO community_polls (question, scenario, tags, sort_weight)
SELECT * FROM (VALUES
  ('吵架後，誰該先低頭？', '一場沒有對錯的爭執後，兩個人都在等對方先開口。你覺得呢？', ARRAY['溝通','冷戰'], 60),
  ('另一半已讀不回，你會？', '訊息顯示已讀，但過了好幾小時都沒回。當下你通常怎麼做？', ARRAY['溝通','焦慮'], 50),
  ('伴侶心情很差但說「沒事」，你會？', 'TA 明顯不太對勁，你問了卻只換來一句「沒事」。', ARRAY['情緒','關心'], 40),
  ('紀念日對方忘記了，你會？', '你記得清清楚楚，但這天過完了 TA 都沒提起。', ARRAY['期待','失落'], 30),
  ('家事分配不均，你會？', '你覺得自己做得比較多，但說出來又怕像在計較。', ARRAY['家務','公平'], 20),
  ('伴侶和前任還是朋友，你會？', 'TA 說只是普通朋友，但你心裡總有點在意。', ARRAY['信任','界線'], 10)
) AS v(question, scenario, tags, sort_weight)
WHERE NOT EXISTS (SELECT 1 FROM community_polls);

-- Seed options for each seeded poll (matched by question text).
INSERT INTO poll_options (poll_id, label, sort_order)
SELECT p.id, o.label, o.sort_order
FROM community_polls p
JOIN (VALUES
  ('吵架後，誰該先低頭？', '我會先開口，關係比面子重要', 0),
  ('吵架後，誰該先低頭？', '等對方先，我這次不想讓步', 1),
  ('吵架後，誰該先低頭？', '不用低頭，找個中性話題自然和好', 2),
  ('吵架後，誰該先低頭？', '看是誰的錯，錯的先道歉', 3),

  ('另一半已讀不回，你會？', '耐心等，TA 可能在忙', 0),
  ('另一半已讀不回，你會？', '再傳一則問怎麼了', 1),
  ('另一半已讀不回，你會？', '直接打電話', 2),
  ('另一半已讀不回，你會？', '也不回了，看誰撐得住', 3),

  ('伴侶心情很差但說「沒事」，你會？', '陪在旁邊，不追問', 0),
  ('伴侶心情很差但說「沒事」，你會？', '溫柔追問到底怎麼了', 1),
  ('伴侶心情很差但說「沒事」，你會？', '給點空間，晚點再關心', 2),
  ('伴侶心情很差但說「沒事」，你會？', '用行動讓 TA 好過（買愛吃的、抱抱）', 3),

  ('紀念日對方忘記了，你會？', '直接說出來，我很在意', 0),
  ('紀念日對方忘記了，你會？', '假裝沒事，但心裡受傷', 1),
  ('紀念日對方忘記了，你會？', '主動提醒並一起補過', 2),
  ('紀念日對方忘記了，你會？', '算了，紀念日沒那麼重要', 3),

  ('家事分配不均，你會？', '心平氣和提出重新分工', 0),
  ('家事分配不均，你會？', '忍著自己做，累積久了才爆發', 1),
  ('家事分配不均，你會？', '用「我訊息」說出自己的累', 2),
  ('家事分配不均，你會？', '排一張分工表一起遵守', 3),

  ('伴侶和前任還是朋友，你會？', '尊重，信任 TA 的界線', 0),
  ('伴侶和前任還是朋友，你會？', '說出我的不安，一起討論界線', 1),
  ('伴侶和前任還是朋友，你會？', '希望盡量減少來往', 2),
  ('伴侶和前任還是朋友，你會？', '很難接受，這是我的底線', 3)
) AS o(question, label, sort_order) ON o.question = p.question
WHERE NOT EXISTS (SELECT 1 FROM poll_options);
