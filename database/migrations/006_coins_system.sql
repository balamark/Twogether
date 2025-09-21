-- Migration: Add coins system
-- This migration adds the coin transactions table and balance view

-- Create coin_transactions table
CREATE TABLE IF NOT EXISTS coin_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('earn', 'spend')),
    description VARCHAR(200) NOT NULL,
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_coin_transactions_couple_id ON coin_transactions(couple_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_date ON coin_transactions(transaction_date DESC);

-- Create coin_balances view
CREATE OR REPLACE VIEW coin_balances AS
SELECT 
    c.id as couple_id,
    COALESCE(
        (SELECT SUM(amount) FROM coin_transactions ct 
         WHERE ct.couple_id = c.id AND ct.transaction_type = 'earn'), 0
    ) - COALESCE(
        (SELECT SUM(amount) FROM coin_transactions ct 
         WHERE ct.couple_id = c.id AND ct.transaction_type = 'spend'), 0
    ) as balance,
    COALESCE(
        (SELECT MAX(transaction_date) FROM coin_transactions ct 
         WHERE ct.couple_id = c.id), NOW()
    ) as last_updated
FROM couples c;

-- Add trigger to automatically update balance when transactions are added
CREATE OR REPLACE FUNCTION update_coin_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- This function is called by the trigger, but the view will automatically recalculate
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_coin_balance ON coin_transactions;
CREATE TRIGGER trigger_update_coin_balance
    AFTER INSERT OR UPDATE OR DELETE ON coin_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_coin_balance(); 