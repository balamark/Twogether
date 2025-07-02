-- Initial schema for Twogether app
-- Creating tables for users, couples, love moments, achievements, coins, and photos
-- Compatible with both PostgreSQL and SQLite

-- Enable UUID extension for PostgreSQL (will be ignored by SQLite)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Couples table
CREATE TABLE IF NOT EXISTS couples (
    id UUID PRIMARY KEY,
    user1_id UUID NOT NULL,
    user2_id UUID NOT NULL,
    couple_name VARCHAR(100),
    anniversary_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user1_id, user2_id),
    CHECK(user1_id != user2_id)
);

-- Index for faster couple lookups
CREATE INDEX IF NOT EXISTS idx_couples_users ON couples(user1_id, user2_id);

-- Love moments table
CREATE TABLE IF NOT EXISTS love_moments (
    id UUID PRIMARY KEY,
    couple_id UUID NOT NULL,
    recorded_by UUID NOT NULL,
    moment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_love_moments_couple ON love_moments(couple_id);
CREATE INDEX IF NOT EXISTS idx_love_moments_date ON love_moments(moment_date);
CREATE INDEX IF NOT EXISTS idx_love_moments_created ON love_moments(created_at);

-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY,
    couple_id UUID NOT NULL,
    badge_type VARCHAR(50) NOT NULL,
    earned_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    milestone_value INTEGER,
    FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE,
    UNIQUE(couple_id, badge_type)
);

-- Index for faster achievement lookups
CREATE INDEX IF NOT EXISTS idx_achievements_couple ON achievements(couple_id);

-- Coin transactions table
CREATE TABLE IF NOT EXISTS coin_transactions (
    id UUID PRIMARY KEY,
    couple_id UUID NOT NULL,
    amount INTEGER NOT NULL,
    transaction_type VARCHAR(10) NOT NULL CHECK(transaction_type IN ('earn', 'spend')),
    earned_from VARCHAR(100),
    spent_on VARCHAR(100),
    description TEXT NOT NULL,
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE
);

-- Index for faster coin transaction queries
CREATE INDEX IF NOT EXISTS idx_coin_transactions_couple ON coin_transactions(couple_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_date ON coin_transactions(transaction_date);

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY,
    couple_id UUID NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    caption TEXT,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    memory_date TIMESTAMP WITH TIME ZONE NOT NULL,
    FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE
);

-- Index for faster photo queries
CREATE INDEX IF NOT EXISTS idx_photos_couple ON photos(couple_id);
CREATE INDEX IF NOT EXISTS idx_photos_memory_date ON photos(memory_date);

-- Create a view for coin balances
CREATE VIEW IF NOT EXISTS coin_balances AS
SELECT 
    couple_id,
    SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE -amount END) as balance,
    MAX(transaction_date) as last_updated
FROM coin_transactions
GROUP BY couple_id; 