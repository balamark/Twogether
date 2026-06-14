-- Therapist accounts, self-service profiles, email verification, identity docs,
-- custom expertise areas, and the "suspended" moderation state.
--
-- Background: migration 041 created the therapists directory where applicants
-- submit a public form and admins approve/reject. This migration grows that
-- into a real account-backed flow:
--
--   1. Every approved/applying therapist is linked to a `users` row (user_id
--      already exists from 041) so they can log in and edit their own profile
--      (name, rate, photo, bio, …). Sign-up now provisions that account.
--   2. Email verification — therapists confirm the contact email is theirs via
--      a tokenised link before their profile is trusted.
--   3. Identity documents — therapists upload certificates / licences for the
--      admin to verify their credentials. Stored as an array of file URLs.
--   4. Custom expertise areas — free-text specialties beyond the fixed
--      focus_areas list, so therapists aren't boxed into our 8 categories.
--   5. A `suspended` status so admins can temporarily hide an approved
--      therapist (e.g. while investigating a complaint) without deleting them.

ALTER TABLE therapists
  -- Free-text expertise the therapist typed in themselves (e.g. "EMDR",
  -- "創傷知情", "LGBTQ+ 友善"). Complements the fixed focus_areas taxonomy.
  ADD COLUMN IF NOT EXISTS custom_specialties TEXT[] NOT NULL DEFAULT '{}',

  -- Email verification. verified flips true when the therapist clicks the
  -- tokenised link we email them. token is cleared once used.
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_sent_at TIMESTAMP WITH TIME ZONE,

  -- Identity / credential documents uploaded for admin review. Array of file
  -- URLs (certificates, licences). Shown to admins only — never in the public
  -- browse payload.
  ADD COLUMN IF NOT EXISTS identity_documents TEXT[] NOT NULL DEFAULT '{}',

  -- Identity review state, tracked separately from the listing `status` so a
  -- therapist can be live (approved) while their documents are still pending,
  -- or flagged for missing credentials.
  --   unverified : no documents submitted yet
  --   submitted  : documents uploaded, awaiting admin review
  --   verified   : admin confirmed credentials
  --   rejected   : admin rejected the submitted documents
  ADD COLUMN IF NOT EXISTS identity_status VARCHAR(16) NOT NULL DEFAULT 'unverified';

-- Widen the listing status to allow 'suspended'. The constraint from 041 only
-- permitted pending/approved/rejected, so drop and recreate it.
ALTER TABLE therapists DROP CONSTRAINT IF EXISTS therapists_status_valid;
ALTER TABLE therapists ADD CONSTRAINT therapists_status_valid
  CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

ALTER TABLE therapists DROP CONSTRAINT IF EXISTS therapists_identity_status_valid;
ALTER TABLE therapists ADD CONSTRAINT therapists_identity_status_valid
  CHECK (identity_status IN ('unverified', 'submitted', 'verified', 'rejected'));

-- A user account maps to (in practice) one therapist profile. Non-unique
-- partial index: we enforce "one active profile per user" in the apply handler
-- rather than via a DB constraint, so this migration can never fail on legacy
-- data that already has two rows for the same user. GET /api/therapists/me
-- still resolves deterministically by ordering newest-first.
CREATE INDEX IF NOT EXISTS idx_therapists_by_user
  ON therapists(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Looking a therapist up by their email-verification token must be fast and
-- only matches the (at most one) row mid-verification.
CREATE INDEX IF NOT EXISTS idx_therapists_email_token
  ON therapists(email_verification_token)
  WHERE email_verification_token IS NOT NULL;
