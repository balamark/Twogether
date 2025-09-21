-- Add compliment templates to intimacy_templates table
-- This migration adds sweet compliment messages in Chinese

INSERT INTO intimacy_templates (category, time_hint, roleplay_setup, suggestion_level, is_active) VALUES
-- Compliment category with 10 preloaded messages
('compliment', '甜蜜時光', '你好溫柔，你是我的女神 💕', 'subtle', true),
('compliment', '愛的告白', '你是我見過最美麗的人，每天和你在一起都是幸福 ✨', 'subtle', true),
('compliment', '溫馨時刻', '你的笑容是我最愛的風景，能讓我的心瞬間溫暖 😊', 'subtle', true),
('compliment', '深情表達', '謝謝你一直在我身邊，你是我生命中最珍貴的禮物 🎁', 'subtle', true),
('compliment', '浪漫情話', '和你在一起的每一天，都比昨天更愛你一點 💖', 'subtle', true),
('compliment', '貼心話語', '你總是這麼體貼，讓我覺得自己是世界上最幸運的人 🍀', 'subtle', true),
('compliment', '愛意滿滿', '你的溫柔像春風，你的愛像暖陽，照亮了我的整個世界 🌞', 'subtle', true),
('compliment', '真心話', '遇見你是我這輩子最美好的事，願意和你走過每個春夏秋冬 🌸', 'subtle', true),
('compliment', '甜蜜宣言', '你不只是我的戀人，更是我的最佳朋友和靈魂伴侶 👫', 'subtle', true),
('compliment', '愛的承諾', '無論什麼時候，你都是我心中最特別的那個人 💝', 'subtle', true);