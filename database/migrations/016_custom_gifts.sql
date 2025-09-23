-- Create custom_gifts table for user-created coin gifts
CREATE TABLE IF NOT EXISTS custom_gifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    cost INTEGER NOT NULL CHECK (cost > 0),
    category VARCHAR(20) NOT NULL CHECK (category IN ('service', 'experience', 'physical', 'intimate')),
    icon VARCHAR(10) DEFAULT '🎁',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_custom_gifts_couple_id ON custom_gifts(couple_id);
CREATE INDEX IF NOT EXISTS idx_custom_gifts_created_by ON custom_gifts(created_by);
CREATE INDEX IF NOT EXISTS idx_custom_gifts_category ON custom_gifts(category);
CREATE INDEX IF NOT EXISTS idx_custom_gifts_cost ON custom_gifts(cost);
CREATE INDEX IF NOT EXISTS idx_custom_gifts_created_at ON custom_gifts(created_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_custom_gifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_custom_gifts_updated_at
    BEFORE UPDATE ON custom_gifts
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_gifts_updated_at();