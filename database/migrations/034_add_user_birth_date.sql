-- Migration: Add birth_date to users for age-based health-reference suggestions
-- Nullable; users opt in by filling it in via Settings.

ALTER TABLE users ADD COLUMN birth_date DATE;
