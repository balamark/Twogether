-- Extend pairing_requests to support code-based invites
ALTER TABLE pairing_requests
  ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS short_code VARCHAR(8),
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID;

-- Allow recipient_email to be nullable for code-based invites
ALTER TABLE pairing_requests
  ALTER COLUMN recipient_email DROP NOT NULL;

-- Constrain type values
ALTER TABLE pairing_requests
  DROP CONSTRAINT IF EXISTS pairing_requests_type_check;
ALTER TABLE pairing_requests
  ADD CONSTRAINT pairing_requests_type_check CHECK (type IN ('email', 'code'));

-- Add foreign key for recipient_user_id
ALTER TABLE pairing_requests
  DROP CONSTRAINT IF EXISTS pairing_requests_recipient_user_id_fkey;
ALTER TABLE pairing_requests
  ADD CONSTRAINT pairing_requests_recipient_user_id_fkey
  FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Indexes for new fields
CREATE UNIQUE INDEX IF NOT EXISTS idx_pairing_requests_short_code
  ON pairing_requests(short_code)
  WHERE short_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pairing_requests_type ON pairing_requests(type);
CREATE INDEX IF NOT EXISTS idx_pairing_requests_recipient_user ON pairing_requests(recipient_user_id);

-- Backfill: migrate existing pairing_codes into pairing_requests as code-type invites
INSERT INTO pairing_requests (
  sender_id,
  recipient_email,
  token,
  message,
  status,
  created_at,
  expires_at,
  type,
  short_code
)
SELECT
  pc.created_by,
  NULL,
  md5(random()::text || pc.created_at::text || pc.code),
  NULL,
  CASE
    WHEN pc.used_at IS NULL AND pc.expires_at > NOW() THEN 'pending'
    ELSE 'expired'
  END,
  pc.created_at,
  pc.expires_at,
  'code',
  pc.code
FROM pairing_codes pc
WHERE pc.code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM pairing_requests pr WHERE pr.short_code = pc.code
  );
