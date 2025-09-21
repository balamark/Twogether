-- Migration: Add pairing codes system
-- This migration adds support for partner pairing codes

-- Create pairing_codes table
CREATE TABLE pairing_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(8) NOT NULL UNIQUE,
    couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    used_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Create indexes for faster lookups
CREATE INDEX idx_pairing_codes_code ON pairing_codes(code);
CREATE INDEX idx_pairing_codes_couple ON pairing_codes(couple_id);
CREATE INDEX idx_pairing_codes_expiry ON pairing_codes(expires_at);

-- Add function to generate random pairing code
CREATE OR REPLACE FUNCTION generate_pairing_code() 
RETURNS VARCHAR(8) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Excluding similar looking characters
    result VARCHAR(8) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql; 