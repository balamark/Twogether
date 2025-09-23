-- Update custom_gifts table to use correct category values that match frontend
-- First, drop the old constraint
ALTER TABLE custom_gifts DROP CONSTRAINT IF EXISTS custom_gifts_category_check;

-- Add the new constraint with the correct categories
ALTER TABLE custom_gifts ADD CONSTRAINT custom_gifts_category_check
CHECK (category IN ('service', 'experience', 'physical', 'intimate'));