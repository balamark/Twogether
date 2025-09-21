-- Node.js backend fixes to align with existing Supabase schema
-- This migration ensures our Node.js code works with the existing database structure

-- All tables should already exist in Supabase, so we just need to ensure compatibility

-- Ensure all necessary indexes exist
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_couples_users ON couples(user1_id, user2_id);
CREATE INDEX IF NOT EXISTS idx_achievements_couple ON achievements(couple_id);
CREATE INDEX IF NOT EXISTS idx_achievements_badge_type ON achievements(badge_type);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_code ON pairing_codes(code);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_couple ON pairing_codes(couple_id);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_expires ON pairing_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_couple ON coin_transactions(couple_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_date ON coin_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_love_moments_couple ON love_moments(couple_id);
CREATE INDEX IF NOT EXISTS idx_love_moments_date ON love_moments(moment_date);
CREATE INDEX IF NOT EXISTS idx_photos_couple ON photos(couple_id);
CREATE INDEX IF NOT EXISTS idx_photos_memory_date ON photos(memory_date);
CREATE INDEX IF NOT EXISTS idx_intimacy_requests_couple ON intimacy_requests(couple_id);
CREATE INDEX IF NOT EXISTS idx_intimacy_requests_recipient ON intimacy_requests(recipient_id);
CREATE INDEX IF NOT EXISTS idx_intimacy_requests_status ON intimacy_requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_intimacy_templates_category ON intimacy_templates(category);
CREATE INDEX IF NOT EXISTS idx_alternative_options_category ON alternative_intimacy_options(category);

-- Verify core tables exist (these should already be in Supabase)
DO $$
BEGIN
    -- Check if essential tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        RAISE EXCEPTION 'users table does not exist - please ensure Supabase schema is properly set up';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'couples') THEN
        RAISE EXCEPTION 'couples table does not exist - please ensure Supabase schema is properly set up';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'achievements') THEN
        RAISE EXCEPTION 'achievements table does not exist - please ensure Supabase schema is properly set up';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pairing_codes') THEN
        RAISE EXCEPTION 'pairing_codes table does not exist - please ensure Supabase schema is properly set up';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coin_transactions') THEN
        RAISE EXCEPTION 'coin_transactions table does not exist - please ensure Supabase schema is properly set up';
    END IF;
END
$$;