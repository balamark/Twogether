-- 溫柔提醒 tone catalog becomes admin-managed (/admin →「溫柔提醒」).
--
-- Until now the platform-voiced reminders on the 已經幾天沒有親密了 card were a
-- hard-coded list in lib/intimacyNudgeTones.js. They now live here so the admin
-- can add, edit, hide and delete them without a deploy. `{days}` in sample /
-- sample_en is replaced with the real gap. sample_en / label_en serve the
-- English UI and fall back to the 繁中 dictionary translation when blank.
-- At most one tone is `recommended` (always offered first). The code keeps the
-- built-in list as a fallback when this table has no active rows.

CREATE TABLE IF NOT EXISTS intimacy_nudge_tones (
  id VARCHAR(40) PRIMARY KEY,
  label VARCHAR(40) NOT NULL,
  label_en VARCHAR(60),
  emoji VARCHAR(16),
  sample TEXT NOT NULL,
  sample_en TEXT,
  recommended BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS intimacy_nudge_tones_one_recommended
  ON intimacy_nudge_tones (recommended) WHERE recommended;

INSERT INTO intimacy_nudge_tones (id, label, label_en, emoji, sample, sample_en, recommended, sort_order)
VALUES
  ('warm', '溫柔關心', 'Gentle care', '💛', 'Twogether 注意到，你們已經 {days} 天沒有記錄親密時光了。如果最近生活比較忙，不妨找個舒服的時間，好好陪伴彼此。', 'Twogether noticed it''s been {days} days since you recorded an intimate moment. If life''s been busy lately, find a comfortable time to really be with each other.', FALSE, 10),
  ('neutral', '中立系統', 'Neutral system', '💛', '距離上次親密時光已經 {days} 天。每段關係都有自己的步調，如果覺得合適，可以安排一點屬於彼此的時間。', 'It''s been {days} days since your last intimate moment. Every relationship has its own pace; if it feels right, make a little time for each other.', FALSE, 20),
  ('encourage', '鼓勵連結', 'Encourage connection', '🫶', '已經 {days} 天沒有記錄親密時光。一個擁抱、一場散步，或一段沒有打擾的聊天，都能讓彼此更靠近。', 'It''s been {days} days since you recorded an intimate moment. A hug, a walk, or an uninterrupted chat can all bring you closer.', TRUE, 30),
  ('playful', '輕鬆幽默', 'Light and playful', '🔋', '親密能量已經 {days} 天沒有補充囉！找個適合的時機，幫你們的關係充充電吧。✨', 'Your intimacy energy hasn''t been recharged in {days} days! Find a good moment to recharge your relationship. ✨', FALSE, 40),
  ('scientific', '科學感', 'Science-y', '📊', '距離上次親密時光：{days} 天。穩定的親密互動，有助於維持情感連結。', 'Time since your last intimate moment: {days} days. Steady intimacy helps maintain your emotional connection.', FALSE, 50),
  ('romantic', '浪漫風', 'Romantic', '❤️', '已經 {days} 天沒有記錄親密時光了。今晚，也許是個重新感受彼此溫度的好時機。', 'It''s been {days} days since you recorded an intimate moment. Tonight might be a good time to feel each other''s warmth again.', FALSE, 60),
  ('nopressure', '完全無壓力', 'Zero pressure', '💛', '距離上次親密時光已經 {days} 天。不需要急著改變什麼，只希望你們別忘了照顧彼此。', 'It''s been {days} days since your last intimate moment. No need to rush to change anything; we just hope you don''t forget to take care of each other.', FALSE, 70),
  ('beyondsex', '不只談性', 'Not just about sex', '🌿', '已經有 {days} 天沒有記錄親密時光了。親密不一定只有性愛，也可以是一個擁抱、一句關心，或一起度過的一段時光。', 'It''s been {days} days since you recorded an intimate moment. Intimacy isn''t only sex; it can be a hug, a caring word, or time spent together.', FALSE, 80),
  ('friendly', '像朋友提醒', 'Like a friend''s reminder', '😊', '最近是不是有點忙？已經 {days} 天沒有記錄親密時光了，不妨找個時間，好好陪陪彼此。', 'Been a bit busy lately? It''s been {days} days since you recorded an intimate moment. Find some time to really be with each other.', FALSE, 90),
  ('achievement', '成就感', 'Sense of achievement', '✨', '每一次親密互動，都是關係的一次加分。距離上次記錄已經 {days} 天，準備好創造下一個美好時刻了嗎？', 'Every intimate moment is a plus for your relationship. It''s been {days} days since your last record. Ready to create the next good moment?', FALSE, 100),
  ('assistant', 'AI 助理風', 'AI assistant', '🤍', '你們已經 {days} 天沒有記錄親密時光了。如果最近生活忙碌，不妨安排一點只屬於彼此的時間。', 'It''s been {days} days since you recorded an intimate moment. If life''s been busy, plan a little time just for the two of you.', FALSE, 110),
  ('minimal', '極簡版', 'Minimal', '💛', '距離上次親密時光：{days} 天。找個時間，重新靠近彼此吧。', 'Time since your last intimate moment: {days} days. Find a moment to get close again.', FALSE, 120),
  ('poetic', '詩意', 'Poetic', '🌙', '{days} 天，像一封還沒寄出的信。也許今晚，就是把它交給彼此的時候。', '{days} days, like a letter not yet sent. Maybe tonight is the time to hand it to each other.', FALSE, 130),
  ('cozy', '居家溫馨', 'Cozy at home', '🏠', '已經 {days} 天沒有記錄親密時光了。窩在沙發上、蓋同一條毯子，也是一種很棒的靠近。', 'It''s been {days} days since you recorded an intimate moment. Curling up on the couch under the same blanket is a lovely way to get close, too.', FALSE, 140),
  ('foodie', '美食約會', 'Food date', '🍜', '距離上次親密時光已經 {days} 天。一起煮頓晚餐、分食一碗熱湯，有時候比什麼都暖。', 'It''s been {days} days since your last intimate moment. Cooking dinner together or sharing a bowl of hot soup can be warmer than anything.', FALSE, 150),
  ('nostalgic', '懷舊回憶', 'Nostalgic', '📸', '已經 {days} 天沒有記錄親密時光了。翻翻以前的合照，聊聊當初怎麼開始的，回憶也會把你們拉近。', 'It''s been {days} days since you recorded an intimate moment. Look through old photos and talk about how it all began. Memories can pull you closer, too.', FALSE, 160),
  ('adventure', '小冒險', 'Little adventure', '🗺️', '{days} 天沒有新的親密紀錄囉！試試一起做件沒做過的小事，新鮮感是關係最好的燃料。', 'No new intimate moments in {days} days! Try something small you''ve never done together. Novelty is great fuel for a relationship.', FALSE, 170),
  ('weather', '天氣日常', 'Everyday weather', '☔', '距離上次親密時光已經 {days} 天。不管今天是晴天還是雨天，都適合在彼此身邊多待一會兒。', 'It''s been {days} days since your last intimate moment. Sunny or rainy, today is a good day to stay by each other a little longer.', FALSE, 180),
  ('gratitude', '感謝', 'Gratitude', '🙏', '已經 {days} 天沒有記錄親密時光了。今天不妨跟對方說一件你很感謝的小事，親密常常從這裡開始。', 'It''s been {days} days since you recorded an intimate moment. Try telling each other one small thing you''re grateful for today. Closeness often starts there.', FALSE, 190),
  ('selfcare', '先照顧自己', 'Self-care first', '🛁', '距離上次親密時光已經 {days} 天。先讓自己好好休息，放鬆的兩個人，更容易自然地靠近。', 'It''s been {days} days since your last intimate moment. Get some real rest first. Two relaxed people find their way to each other more naturally.', FALSE, 200),
  ('quest', '遊戲任務', 'Game quest', '🎮', '新任務解鎖：已經 {days} 天沒有親密紀錄！完成條件：一起度過 30 分鐘不看手機的時光。🏆', 'New quest unlocked: {days} days without an intimate moment! Goal: spend 30 phone-free minutes together. 🏆', FALSE, 210),
  ('plant', '澆花比喻', 'Watering the plant', '🌱', '關係像一盆植物，已經 {days} 天沒澆水囉。一點點陪伴，就能讓它重新長出新芽。', 'A relationship is like a houseplant, and it''s gone {days} days without water. A little time together helps it sprout again.', FALSE, 220),
  ('music', '音樂時光', 'Music moment', '🎶', '已經 {days} 天沒有記錄親密時光了。放一首你們都喜歡的歌，一起聽完，就是很好的開始。', 'It''s been {days} days since you recorded an intimate moment. Put on a song you both love and listen to it together. That''s a great place to start.', FALSE, 230),
  ('bedtime', '睡前時光', 'Bedtime', '😴', '距離上次親密時光已經 {days} 天。今晚睡前，留十分鐘給彼此，聊聊今天、抱一下再睡。', 'It''s been {days} days since your last intimate moment. Tonight before bed, save ten minutes for each other: talk about your day and hug before sleep.', FALSE, 240),
  ('weekend', '週末計畫', 'Weekend plan', '🗓️', '已經 {days} 天沒有記錄親密時光了。這個週末，要不要先在行事曆上替彼此留一個位置？', 'It''s been {days} days since you recorded an intimate moment. How about saving a spot for each other on this weekend''s calendar?', FALSE, 250),
  ('cute', '撒嬌萌系', 'Cute and cuddly', '🐱', '叮咚～已經 {days} 天沒有親密紀錄了喵！快去找對方蹭一蹭、抱一抱吧～🐾', 'Ding-dong~ It''s been {days} days without an intimate moment, meow! Go snuggle up and share a hug~ 🐾', FALSE, 260),
  ('coffee', '咖啡時光', 'Coffee time', '☕', '距離上次親密時光已經 {days} 天。明天早上，一起慢慢喝杯咖啡，也是一種溫柔的靠近。', 'It''s been {days} days since your last intimate moment. Slowly sharing a cup of coffee tomorrow morning is a gentle way to get close, too.', FALSE, 270),
  ('moonlight', '月光浪漫', 'Moonlit romance', '🌌', '已經 {days} 天沒有記錄親密時光了。今晚關掉燈、拉開窗簾，在月光下說說心裡話吧。', 'It''s been {days} days since you recorded an intimate moment. Tonight, turn off the lights, open the curtains, and share what''s on your minds under the moonlight.', FALSE, 280),
  ('curious', '好奇提問', 'Curious question', '💭', '{days} 天沒有親密紀錄了。今天試著問對方一個問題：「最近有什麼事讓你很開心？」', 'No intimate moments in {days} days. Try asking each other one question today: "What''s made you happy lately?"', FALSE, 290),
  ('tinystep', '小小一步', 'One tiny step', '👣', '距離上次親密時光已經 {days} 天。不用大計畫，牽個手、多看一眼，小小一步就夠了。', 'It''s been {days} days since your last intimate moment. No big plans needed. Holding hands or one more look is a small step, and that''s enough.', FALSE, 300),
  ('teammates', '隊友風', 'Teammates', '🤝', '你們是最好的隊友，已經 {days} 天沒有一起「充電」了。找個時間，好好為彼此加油打氣吧！', 'You two are the best teammates, and it''s been {days} days since you last recharged together. Find some time to cheer each other on!', FALSE, 310),
  ('literary', '文青風', 'Literary', '📖', '已經 {days} 天沒有記錄親密時光了。日子再忙，也別忘了在彼此的故事裡，留一頁給今天。', 'It''s been {days} days since you recorded an intimate moment. However busy life gets, save a page in your shared story for today.', FALSE, 320)
ON CONFLICT (id) DO NOTHING;
