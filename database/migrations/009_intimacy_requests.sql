-- Migration: Add intimacy requests and notifications system
-- This migration adds support for intimacy requests, notifications, and alternative intimacy suggestions

-- Create intimacy_requests table
CREATE TABLE intimacy_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Request content
    message_content TEXT NOT NULL,
    request_type VARCHAR(50) NOT NULL DEFAULT 'intimate', -- 'intimate', 'scheduled'
    roleplay_category VARCHAR(100), -- 'idol_photographer', 'teacher_student', 'foreign_student'
    scheduled_time TIMESTAMP WITH TIME ZONE,
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'expired'
    responded_at TIMESTAMP WITH TIME ZONE,
    response_message TEXT,
    
    -- Alternative intimacy selection (when rejected)
    alternative_type VARCHAR(50), -- 'physical', 'emotional', 'playful', 'companionship', 'custom'
    alternative_content TEXT,
    alternative_scheduled_time TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    
    CONSTRAINT valid_expiry CHECK (expires_at > created_at),
    CONSTRAINT valid_sender_receiver CHECK (sender_id != receiver_id)
);

-- Create notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification content
    notification_type VARCHAR(50) NOT NULL, -- 'intimacy_request', 'request_response', 'alternative_reminder', 'general'
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    
    -- Related entities
    intimacy_request_id UUID REFERENCES intimacy_requests(id) ON DELETE CASCADE,
    related_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- The other person involved
    
    -- Status
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    priority INTEGER NOT NULL DEFAULT 1 -- 1=low, 2=medium, 3=high
);

-- Create intimacy_templates table for predefined messages
CREATE TABLE intimacy_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL, -- 'idol_photographer', 'teacher_student', 'foreign_student'
    time_hint VARCHAR(200) NOT NULL, -- e.g., "孩子睡著後", "兩點後"
    roleplay_setup TEXT NOT NULL,
    suggestion_level VARCHAR(20) NOT NULL, -- 'subtle', 'moderate', 'explicit'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create alternative_intimacy_options table
CREATE TABLE alternative_intimacy_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL, -- 'physical', 'emotional', 'playful', 'companionship'
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    estimated_duration VARCHAR(50), -- e.g., "5分鐘", "15分鐘"
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_intimacy_requests_couple ON intimacy_requests(couple_id);
CREATE INDEX idx_intimacy_requests_receiver ON intimacy_requests(receiver_id);
CREATE INDEX idx_intimacy_requests_status ON intimacy_requests(status);
CREATE INDEX idx_intimacy_requests_created ON intimacy_requests(created_at);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(notification_type);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

CREATE INDEX idx_intimacy_templates_category ON intimacy_templates(category);
CREATE INDEX idx_alternative_options_category ON alternative_intimacy_options(category);

-- Insert default intimacy message templates
INSERT INTO intimacy_templates (category, time_hint, roleplay_setup, suggestion_level) VALUES
-- Idol/Photographer roleplay
('idol_photographer', '快去換上下一套偶像見面會的服裝', '攝影師已經在外面準備好了 😉', 'moderate'),
('idol_photographer', '等你孩子睡了', '舞台就只屬於你和我 🎤', 'moderate'),
('idol_photographer', '兩點兒子睡著後', '偶像是不是該出來唱歌給你聽 🔥', 'explicit'),
('idol_photographer', '燈光準備好了', '只差你換好造型進棚 🫂', 'moderate'),
('idol_photographer', '舞台後台等你', '我的鏡頭早已鎖定你 😏', 'explicit'),
('idol_photographer', '孩子午睡後', '這個房間就是我們的專屬演唱會 🎶', 'moderate'),

-- Teacher/Student roleplay
('teacher_student', '下課後，教室只剩我們兩個', '我的秘密作業等你完成 😏', 'explicit'),
('teacher_student', '孩子睡著後', '輔導時間開始，你準備好了嗎 🫂', 'moderate'),
('teacher_student', '今晚十點後', '老師的桌上有個特別任務等你 🔥', 'explicit'),
('teacher_student', '放學後的教室很安靜', '你敢留下來嗎 😉', 'moderate'),
('teacher_student', '兩點兒子睡著後', '我想和你單獨討論課本之外的事 📝', 'explicit'),

-- Foreign Student roleplay
('foreign_student', '夜晚八點，城市安靜了', '我們的秘密約會開始了 🫂', 'moderate'),
('foreign_student', '等孩子睡著後', '我想帶你去我們的私人小酒館 🍷', 'moderate'),
('foreign_student', '兩點後', '旅館房間只屬於我們 😏', 'explicit'),
('foreign_student', '咖啡店打烊後', '我想偷偷靠近你 🔥', 'explicit'),
('foreign_student', '夜市熄燈', '只有我和你，想不想試試特殊任務？', 'explicit');

-- Insert default alternative intimacy options
INSERT INTO alternative_intimacy_options (category, title, description, estimated_duration, is_default, sort_order) VALUES
-- Physical intimacy alternatives
('physical', '5分鐘擁抱', '緊緊擁抱對方，感受彼此的溫暖', '5分鐘', true, 1),
('physical', '牽手散步', '手牽手到陽台或附近走走', '10分鐘', true, 2),
('physical', '頭靠肩膀', '依偎在一起，頭靠在對方肩膀上', '5分鐘', true, 3),
('physical', '互相按摩', '輕柔地為對方按摩肩膀或手臂', '15分鐘', true, 4),

-- Emotional intimacy alternatives  
('emotional', '分享今天心情', '聊聊今天發生的事和感受', '10分鐘', true, 1),
('emotional', '說一句感謝', '表達對伴侶的感謝和讚美', '3分鐘', true, 2),
('emotional', '分享小回憶', '回憶一件美好的共同經歷', '5分鐘', true, 3),
('emotional', '互相讚美', '說說對方今天最棒的地方', '5分鐘', true, 4),

-- Playful alternatives
('playful', '搞怪自拍挑戰', '一起拍3分鐘的有趣照片', '3分鐘', true, 1),
('playful', '看短影片', '一起看一小段有趣的影片', '10分鐘', true, 2),
('playful', '小遊戲時光', '玩一局簡單的手機遊戲', '15分鐘', true, 3),
('playful', '唱歌給對方聽', '為對方哼唱一首喜歡的歌', '5分鐘', true, 4),

-- Companionship alternatives
('companionship', '一起泡茶', '準備一壺茶，安靜地享受', '15分鐘', true, 1),
('companionship', '準備小點心', '為對方準備喜歡的小零食', '10分鐘', true, 2),
('companionship', '看夜景', '一起到窗邊或陽台看風景', '10分鐘', true, 3),
('companionship', '規劃小旅行', '討論下次想一起去的地方', '20分鐘', true, 4);

-- Function to automatically expire old requests
CREATE OR REPLACE FUNCTION expire_old_intimacy_requests()
RETURNS VOID AS $$
BEGIN
    UPDATE intimacy_requests 
    SET status = 'expired' 
    WHERE status = 'pending' 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to create notification for intimacy request
CREATE OR REPLACE FUNCTION notify_intimacy_request()
RETURNS TRIGGER AS $$
BEGIN
    -- Create notification for receiver
    INSERT INTO notifications (
        user_id, 
        notification_type, 
        title, 
        content, 
        intimacy_request_id, 
        related_user_id,
        priority
    ) VALUES (
        NEW.receiver_id,
        'intimacy_request',
        '親密邀請',
        NEW.message_content,
        NEW.id,
        NEW.sender_id,
        2
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create notification for request response
CREATE OR REPLACE FUNCTION notify_request_response()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify if status changed to accepted or rejected
    IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'rejected') THEN
        INSERT INTO notifications (
            user_id,
            notification_type,
            title,
            content,
            intimacy_request_id,
            related_user_id,
            priority
        ) VALUES (
            NEW.sender_id,
            'request_response',
            CASE 
                WHEN NEW.status = 'accepted' THEN '邀請被接受 💕'
                ELSE '邀請被婉拒'
            END,
            CASE 
                WHEN NEW.status = 'accepted' THEN '你的親密邀請被接受了！'
                WHEN NEW.alternative_content IS NOT NULL THEN '伴侶選擇了替代方案：' || NEW.alternative_content
                ELSE '你的親密邀請被婉拒了'
            END,
            NEW.id,
            NEW.receiver_id,
            2
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_notify_intimacy_request
    AFTER INSERT ON intimacy_requests
    FOR EACH ROW
    EXECUTE FUNCTION notify_intimacy_request();

CREATE TRIGGER trigger_notify_request_response
    AFTER UPDATE ON intimacy_requests
    FOR EACH ROW
    EXECUTE FUNCTION notify_request_response();
