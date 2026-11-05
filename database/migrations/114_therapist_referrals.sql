-- 諮商師專屬邀請碼 (therapist referral codes).
--
-- Each approved therapist gets one short code / link to hand to the couples
-- they already see. A couple that joins through it gets 30 days of Premium
-- (once per couple, granted when the couple is paired), may add the therapist
-- as their 專屬心理師 in the same step, and every rewarded couple lowers the
-- therapist's platform fee on paid video sessions (see routes/therapists.js
-- computeFeeSplit).

ALTER TABLE therapists
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16);

CREATE UNIQUE INDEX IF NOT EXISTS idx_therapists_referral_code
  ON therapists(referral_code) WHERE referral_code IS NOT NULL;

-- One row per referred USER (a user can only be referred once, by the first
-- therapist whose code they claim). couple_id / rewarded_at fill in once the
-- user's couple is paired and the Premium month is granted.
CREATE TABLE IF NOT EXISTS therapist_referrals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id   UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  couple_id      UUID REFERENCES couples(id) ON DELETE SET NULL,
  entitlement_id UUID REFERENCES couple_entitlements(id) ON DELETE SET NULL,
  status         VARCHAR(16) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'rewarded')),
  -- true when the user was new to Twogether at claim time (signed up within
  -- a day of claiming) — separates acquisition from existing-user activation.
  new_user       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  rewarded_at    TIMESTAMP WITH TIME ZONE,
  UNIQUE (user_id)
);

-- A couple gets the referral Premium month once, whichever partner claimed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_therapist_referrals_rewarded_couple
  ON therapist_referrals(couple_id) WHERE status = 'rewarded';

CREATE INDEX IF NOT EXISTS idx_therapist_referrals_therapist
  ON therapist_referrals(therapist_id, status);

ALTER TABLE public.therapist_referrals ENABLE ROW LEVEL SECURITY;
