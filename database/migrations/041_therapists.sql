-- Human therapists (心理諮商師) directory + consultation requests.
--
-- This adds the "talk to a real, certified human" option alongside the
-- existing (cheaper) AI rephrase feature. Therapists apply via a public sign-up
-- form; applications land as 'pending' and only become visible in the browse
-- list once an admin approves them (status = 'approved'). Users/couples then
-- pick a therapist and send a consultation request.
--
-- Focus areas (family / couple / childhood / individual / sexuality /
-- parenting / grief / anxiety) are stored as a TEXT[] so a therapist can list
-- several and the browse page can filter by any one of them.

CREATE TABLE IF NOT EXISTS therapists (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The user account that submitted the application, if they were logged in.
  -- Nullable so a therapist can apply without first creating a couples account.
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Public profile
  display_name     VARCHAR(120) NOT NULL,
  title            VARCHAR(120),                 -- e.g. 諮商心理師 / 臨床心理師
  license_no       VARCHAR(80),                  -- 證照字號 (shown only to admins)
  focus_areas      TEXT[] NOT NULL DEFAULT '{}', -- family | couple | childhood | individual | sexuality | parenting | grief | anxiety
  languages        TEXT[] NOT NULL DEFAULT '{}', -- e.g. {zh, en}
  years_experience INTEGER,
  bio              TEXT,
  photo_url        TEXT,

  -- Rate. Stored as integer TWD per session plus the session length so the
  -- browse card can show "NT$1,800 / 50 分鐘".
  rate_twd         INTEGER NOT NULL,
  session_minutes  INTEGER NOT NULL DEFAULT 50,

  -- Contact (private — used to reach the therapist, never shown in browse)
  contact_email    VARCHAR(255) NOT NULL,
  contact_phone    VARCHAR(40),

  -- Moderation
  status           VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_at      TIMESTAMP WITH TIME ZONE,
  review_note      TEXT,

  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT therapists_rate_positive CHECK (rate_twd >= 0),
  CONSTRAINT therapists_status_valid CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Browse list is "approved therapists, newest first"; the partial index keeps
-- that query cheap as the rejected/pending rows pile up.
CREATE INDEX IF NOT EXISTS idx_therapists_approved
  ON therapists(created_at DESC)
  WHERE status = 'approved';

-- One consultation request per (user → therapist) interaction. couple_id is
-- recorded when the requester is paired so the therapist knows it's a couple.
CREATE TABLE IF NOT EXISTS therapist_consultations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id   UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  requester_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  couple_id      UUID REFERENCES couples(id) ON DELETE SET NULL,

  focus_area     VARCHAR(40),                 -- which area the request is about
  message        TEXT,                        -- what the user/couple wants help with
  contact_email  VARCHAR(255),                -- where the therapist should reply
  preferred_time TIMESTAMP WITH TIME ZONE,    -- optional requested slot

  status         VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | accepted | declined | completed | cancelled
  responded_at   TIMESTAMP WITH TIME ZONE,
  response_note  TEXT,

  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT therapist_consultations_status_valid
    CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_therapist_consultations_requester
  ON therapist_consultations(requester_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_therapist_consultations_therapist
  ON therapist_consultations(therapist_id, created_at DESC);

-- Seed a few approved therapists so the browse page is populated on first run.
-- These are illustrative profiles; real applicants come through the sign-up form.
INSERT INTO therapists
  (display_name, title, focus_areas, languages, years_experience, bio,
   rate_twd, session_minutes, contact_email, status, reviewed_at)
VALUES
  ('林書宇', '諮商心理師',
   ARRAY['couple', 'family', 'sexuality'], ARRAY['zh', 'en'], 12,
   '專注於伴侶溝通與親密關係修復，擅長以情緒取向治療（EFT）陪伴伴侶重建信任與連結。相信每段關係都值得被好好理解。',
   1800, 50, 'shuyu.lin@example.com', 'approved', NOW()),
  ('陳怡安', '臨床心理師',
   ARRAY['individual', 'anxiety', 'childhood'], ARRAY['zh'], 8,
   '陪伴成年人梳理童年經驗與焦慮情緒，找回自我價值感。以溫和、不批判的方式，與你一起慢慢來。',
   1600, 50, 'yian.chen@example.com', 'approved', NOW()),
  ('王柏睿', '諮商心理師',
   ARRAY['couple', 'parenting', 'grief'], ARRAY['zh', 'en'], 15,
   '協助伴侶在成為父母後重新校準關係，也陪伴經歷失落與悲傷的家庭。相信對話是改變的起點。',
   2000, 60, 'borui.wang@example.com', 'approved', NOW()),
  ('黃心妍', '諮商心理師',
   ARRAY['family', 'childhood', 'individual'], ARRAY['zh'], 6,
   '專長家庭關係與原生家庭議題，擅長陪伴年輕族群探索自我與界線。',
   1400, 50, 'hsinyen.huang@example.com', 'approved', NOW());
