-- Migration: cycle tracking
-- Adds an opt-in toggle on users and a new cycle_records table.
-- One row per period instance (start_date + length_days). Cycle length is
-- derived from consecutive start_date deltas; not stored.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cycle_tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS cycle_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  couple_id UUID,
  tracked_by UUID NOT NULL,
  start_date DATE NOT NULL,
  length_days INTEGER NOT NULL DEFAULT 5 CHECK (length_days BETWEEN 1 AND 14),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE SET NULL,
  FOREIGN KEY (tracked_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cycle_records_couple ON cycle_records(couple_id);
CREATE INDEX IF NOT EXISTS idx_cycle_records_start_date ON cycle_records(start_date);
CREATE INDEX IF NOT EXISTS idx_cycle_records_tracked_by ON cycle_records(tracked_by);
