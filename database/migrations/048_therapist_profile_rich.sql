-- Richer therapist profiles + client reviews.
--
-- The basic profile (041/044) had name, title, focus areas, a short bio and a
-- rate. Real counselor profiles (e.g. seeingcounseling.com) carry much more: a
-- personal message to clients, their treatment approach, current positions,
-- qualifications, training history, published works and articles, plus client
-- testimonials. This migration grows the therapists row to hold those sections
-- and adds a moderated reviews table.
--
-- Free-text sections are TEXT. List sections that are just lines (positions,
-- qualifications, training, license lines) are TEXT[] like the existing
-- focus_areas/custom_specialties. Publications and articles carry a title plus
-- an optional source/url, so they're JSONB arrays of small objects.

ALTER TABLE therapists
  -- Long-form narrative sections.
  ADD COLUMN IF NOT EXISTS intro_message TEXT,   -- 給來談者的一段話 (welcome message)
  ADD COLUMN IF NOT EXISTS approach      TEXT,   -- 治療取向／治療理念
  ADD COLUMN IF NOT EXISTS about         TEXT,   -- 認識治療師

  -- Line-list sections (array of strings).
  ADD COLUMN IF NOT EXISTS certifications     TEXT[] NOT NULL DEFAULT '{}', -- 心理師證照 (license lines)
  ADD COLUMN IF NOT EXISTS current_positions  TEXT[] NOT NULL DEFAULT '{}', -- 現任
  ADD COLUMN IF NOT EXISTS qualifications     TEXT[] NOT NULL DEFAULT '{}', -- 專業資格
  ADD COLUMN IF NOT EXISTS training           TEXT[] NOT NULL DEFAULT '{}', -- 專業訓練

  -- Title + optional source/url. JSONB array of { title, source } / { title, url }.
  ADD COLUMN IF NOT EXISTS publications JSONB NOT NULL DEFAULT '[]', -- 心理專業著作
  ADD COLUMN IF NOT EXISTS articles     JSONB NOT NULL DEFAULT '[]', -- 心理專業文章 / 影音訪談

  -- Whether the therapist is currently taking new clients ("不開放新案預約").
  ADD COLUMN IF NOT EXISTS accepting_new_clients BOOLEAN NOT NULL DEFAULT true;

-- Client reviews / testimonials. Moderated: a review starts 'pending' and only
-- shows publicly once an admin approves it. reviewer_display is the anonymised
-- name shown on the profile (e.g. "林O儀"); author_id ties it to the account
-- that wrote it (for abuse handling), and is never shown publicly.
CREATE TABLE IF NOT EXISTS therapist_reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id     UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  author_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_display VARCHAR(80) NOT NULL,            -- anonymised name shown publicly
  rating           SMALLINT,                        -- optional 1-5 stars
  body             TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  status           VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | approved | hidden
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT therapist_reviews_rating_valid CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT therapist_reviews_status_valid CHECK (status IN ('pending', 'approved', 'hidden'))
);

-- Public profile shows "approved reviews, newest first" for a therapist.
CREATE INDEX IF NOT EXISTS idx_therapist_reviews_approved
  ON therapist_reviews(therapist_id, created_at DESC)
  WHERE status = 'approved';

-- One author leaves at most one review per therapist (enforced in the route too,
-- but the partial unique index makes it a hard guarantee for real accounts).
CREATE UNIQUE INDEX IF NOT EXISTS uq_therapist_reviews_author
  ON therapist_reviews(therapist_id, author_id)
  WHERE author_id IS NOT NULL;
