-- Paid video sessions (視訊諮商): the charged tier on top of the free chat.
--
-- A client who likes a therapist in the free chat books a real-time 1:1 video
-- session. The video itself is third-party (Zoom / Google Meet) — the platform
-- only matches the two parties and stores the meeting link the therapist pastes
-- in after accepting. Payment goes through ECPay (same AioCheckOut helper as the
-- couple Premium passes); the platform keeps a service fee and the therapist
-- nets the rest.
--
-- Fee: 20% standard, but 10% for a therapist's FIRST 10 completed sessions
-- (new-therapist intro rate). The fee rate is computed at payment time and
-- snapshotted onto the booking + order so a later refund/dispute never reprices
-- a historical session. A booking counts toward the "first 10" only once it is
-- both paid AND completed (counts_toward_intro), so unpaid/no-show bookings
-- don't burn intro slots.
--
-- The booking reuses the therapist_consultations row (so the existing chat room,
-- access checks and "my consultations" list all work) — distinguished from the
-- free flow by booking_type = 'scheduled'.

ALTER TABLE therapist_consultations
  -- 'free' = the existing no-charge chat consultation; 'scheduled' = a paid
  -- video booking. Existing rows default to 'free'.
  ADD COLUMN IF NOT EXISTS booking_type VARCHAR(16) NOT NULL DEFAULT 'free',
  -- The free chat this paid booking grew out of (the "預約視訊諮商" nudge), for
  -- context. Nullable; SET NULL keeps the booking if the source chat is removed.
  ADD COLUMN IF NOT EXISTS source_consultation_id UUID
    REFERENCES therapist_consultations(id) ON DELETE SET NULL,

  -- Scheduling + third-party video link (therapist pastes after accepting).
  ADD COLUMN IF NOT EXISTS scheduled_at     TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,            -- snapshot of session_minutes
  ADD COLUMN IF NOT EXISTS meeting_provider VARCHAR(16),        -- zoom | meet | other
  ADD COLUMN IF NOT EXISTS meeting_url      TEXT,
  ADD COLUMN IF NOT EXISTS meeting_set_at   TIMESTAMP WITH TIME ZONE,

  -- Money snapshot (all TWD integers), frozen at charge time.
  ADD COLUMN IF NOT EXISTS price_twd         INTEGER,           -- what the client pays
  ADD COLUMN IF NOT EXISTS fee_rate          INTEGER,           -- 10 or 20 (% kept by platform)
  ADD COLUMN IF NOT EXISTS platform_fee_twd  INTEGER,
  ADD COLUMN IF NOT EXISTS therapist_net_twd INTEGER,
  ADD COLUMN IF NOT EXISTS payment_status    VARCHAR(16) NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMP WITH TIME ZONE,
  -- True once the session is both paid AND completed — the only state that
  -- counts toward the therapist's first-10 intro window.
  ADD COLUMN IF NOT EXISTS counts_toward_intro BOOLEAN NOT NULL DEFAULT false;

-- Allow a 'no_show' outcome alongside the existing statuses.
ALTER TABLE therapist_consultations DROP CONSTRAINT IF EXISTS therapist_consultations_status_valid;
ALTER TABLE therapist_consultations ADD CONSTRAINT therapist_consultations_status_valid
  CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled', 'no_show'));

ALTER TABLE therapist_consultations DROP CONSTRAINT IF EXISTS therapist_consultations_booking_type_valid;
ALTER TABLE therapist_consultations ADD CONSTRAINT therapist_consultations_booking_type_valid
  CHECK (booking_type IN ('free', 'scheduled'));

ALTER TABLE therapist_consultations DROP CONSTRAINT IF EXISTS therapist_consultations_payment_status_valid;
ALTER TABLE therapist_consultations ADD CONSTRAINT therapist_consultations_payment_status_valid
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'refunded', 'failed'));

-- Counting a therapist's completed intro sessions must be fast.
CREATE INDEX IF NOT EXISTS idx_therapist_consultations_intro
  ON therapist_consultations(therapist_id)
  WHERE counts_toward_intro = true;

-- One row per ECPay checkout attempt for a session. Mirrors payment_orders (040)
-- but keyed to a consultation + therapist rather than a couple, so the Premium
-- pass flow and its couple_id NOT NULL constraint stay untouched. merchant_trade_no
-- is OUR id sent to ECPay and is what the server-to-server callback matches on;
-- UNIQUE makes the callback idempotent. The fee split is snapshotted here too.
CREATE TABLE IF NOT EXISTS session_payment_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id   UUID NOT NULL REFERENCES therapist_consultations(id) ON DELETE CASCADE,
  payer_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  therapist_id      UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  merchant_trade_no VARCHAR(32) NOT NULL UNIQUE,
  amount            INTEGER NOT NULL,                       -- = price_twd, what the client pays
  fee_rate          INTEGER NOT NULL,                       -- 10 | 20 snapshot
  platform_fee      INTEGER NOT NULL,
  therapist_net     INTEGER NOT NULL,
  status            VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | paid | failed
  payment_method    VARCHAR(32),                            -- ECPay PaymentType
  ecpay_trade_no    VARCHAR(32),                            -- ECPay's TradeNo from callback
  raw_callback      JSONB,                                  -- full callback payload, for audit
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMP WITH TIME ZONE,

  CONSTRAINT session_payment_orders_status_valid CHECK (status IN ('pending', 'paid', 'failed')),
  CONSTRAINT session_payment_orders_fee_rate_valid CHECK (fee_rate IN (10, 20))
);

CREATE INDEX IF NOT EXISTS idx_session_payment_orders_consultation
  ON session_payment_orders(consultation_id);

CREATE INDEX IF NOT EXISTS idx_session_payment_orders_therapist
  ON session_payment_orders(therapist_id, created_at DESC);
