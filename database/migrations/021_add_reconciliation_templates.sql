-- Add reconciliation templates to intimacy_templates table
-- These messages help couples reconcile after a fight

INSERT INTO intimacy_templates (category, time_hint, roleplay_setup, suggestion_level, is_active) VALUES
-- Reconciliation category with 20 heartfelt apology and reconciliation messages
('reconciliation', '真心道歉', '對不起，我說話太衝了。你對我很重要，我不想讓你難過 💔', 'subtle', true),
('reconciliation', '溫柔認錯', '是我錯了，我不該那樣說話。請原諒我好嗎？我真的很在乎你 🙏', 'subtle', true),
('reconciliation', '真誠反省', '剛才的爭吵讓我意識到，我傷害了你。對不起，我會改進的 💙', 'subtle', true),
('reconciliation', '愛的挽回', '吵架後才發現，沒有你的每一分鐘都好難熬。我們和好吧？❤️', 'subtle', true),
('reconciliation', '深刻懊悔', '我知道我讓你失望了。給我一個機會，讓我證明我會做得更好 🌹', 'subtle', true),
('reconciliation', '溫暖擁抱', '我想抱抱你，告訴你我有多愛你。我們不要再冷戰了好嗎？🤗', 'subtle', true),
('reconciliation', '誠摯道歉', '對不起讓你哭了，看到你難過我的心也在痛。請給我一個彌補的機會 😢', 'subtle', true),
('reconciliation', '真心話', '吵架是我的錯，但失去你才是我最不能承受的。我愛你 💕', 'subtle', true),
('reconciliation', '溫柔請求', '我不想就這樣結束這一天。能和我說說話嗎？我想聽聽你的聲音 📞', 'subtle', true),
('reconciliation', '認真反思', '我想了很久，是我太固執了。你說得對，我應該多聽聽你的想法 💭', 'subtle', true),
('reconciliation', '愛的承諾', '我保證以後會更注意自己的言行。你的感受對我來說最重要 🤝', 'subtle', true),
('reconciliation', '甜蜜和解', '生氣的時候說的話不算數，我心裡最愛的還是你。我們和好吧？💝', 'subtle', true),
('reconciliation', '真誠溝通', '我們好好談談好嗎？我想了解你的感受，也想讓你明白我的心意 💬', 'subtle', true),
('reconciliation', '溫馨約定', '以後有什麼不開心的，我們都好好說，不要再吵架了好嗎？🫂', 'subtle', true),
('reconciliation', '深情告白', '吵架讓我更確定，這輩子我只想和你在一起。對不起，我愛你 💖', 'subtle', true),
('reconciliation', '真心懺悔', '是我不夠成熟，讓你受委屈了。我會努力成為更好的伴侶 🌟', 'subtle', true),
('reconciliation', '溫暖安慰', '我知道我傷了你的心。讓我用行動證明，我有多珍惜你 🎁', 'subtle', true),
('reconciliation', '柔情道歉', '親愛的，對不起。沒有什麼比你更重要，我不想失去你 🌺', 'subtle', true),
('reconciliation', '真情流露', '冷靜下來後我發現，你才是對的。謝謝你總是包容我 🙇', 'subtle', true),
('reconciliation', '愛的修復', '每對情侶都會吵架，但我們的愛更強大。讓我們一起度過這個難關吧 💪', 'subtle', true);