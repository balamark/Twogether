-- Create custom_scripts table for user-created roleplay scripts
CREATE TABLE IF NOT EXISTS custom_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('romantic', 'adventurous', 'school', 'bold')),
    scenario TEXT NOT NULL,
    content TEXT NOT NULL,
    tags JSONB DEFAULT '[]'::jsonb,
    duration VARCHAR(50) DEFAULT '15-30分鐘',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_custom_scripts_couple_id ON custom_scripts(couple_id);
CREATE INDEX IF NOT EXISTS idx_custom_scripts_created_by ON custom_scripts(created_by);
CREATE INDEX IF NOT EXISTS idx_custom_scripts_category ON custom_scripts(category);
CREATE INDEX IF NOT EXISTS idx_custom_scripts_created_at ON custom_scripts(created_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_custom_scripts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_custom_scripts_updated_at
    BEFORE UPDATE ON custom_scripts
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_scripts_updated_at();