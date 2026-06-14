-- Monthly revenue-share pool for free-chat / public-Q&A activity.
--
-- Therapists answer clients for free in the chat rooms (and some of those become
-- public 公開問答). To reward that unpaid work, the platform sets aside part of
-- its monthly revenue and distributes it to the therapists who were active that
-- month. The split starts EVEN (every active therapist gets the same), and is
-- designed to move to volume/engagement-weighted later without a data migration:
-- engagement is derived at compute time from consultation_messages + published
-- threads + helpful votes (see 045), not stored as a running counter.
--
-- IMPORTANT: this pool is paid out MANUALLY. ECPay AioCheckOut only COLLECTS
-- money — it cannot disburse to therapists. So payout_status here records that an
-- admin paid a therapist out-of-band; there is no automated bank transfer.

-- One row per month being distributed. pool_twd is entered by an admin (the
-- platform's chosen revenue slice for that month).
CREATE TABLE IF NOT EXISTS qa_revenue_pools (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month   DATE NOT NULL UNIQUE,            -- first day of the month, e.g. 2026-06-01
  pool_twd       INTEGER NOT NULL,               -- admin-entered total to distribute
  split_strategy VARCHAR(24) NOT NULL DEFAULT 'even', -- even | volume | engagement
  status         VARCHAR(16) NOT NULL DEFAULT 'draft', -- draft | computed | finalized | paid_out
  computed_at    TIMESTAMP WITH TIME ZONE,
  finalized_at   TIMESTAMP WITH TIME ZONE,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT qa_revenue_pools_pool_nonneg CHECK (pool_twd >= 0),
  CONSTRAINT qa_revenue_pools_strategy_valid CHECK (split_strategy IN ('even', 'volume', 'engagement')),
  CONSTRAINT qa_revenue_pools_status_valid CHECK (status IN ('draft', 'computed', 'finalized', 'paid_out'))
);

-- Computed per-therapist share for a pool month. Recomputable while the pool is
-- draft/computed; frozen once finalized. payout_status drives the admin "mark
-- as paid" step. The engagement snapshot columns (message/published/vote counts)
-- record what the split was based on, for transparency.
CREATE TABLE IF NOT EXISTS qa_revenue_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         UUID NOT NULL REFERENCES qa_revenue_pools(id) ON DELETE CASCADE,
  therapist_id    UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  message_count   INTEGER NOT NULL DEFAULT 0,     -- free-chat messages this month
  published_count INTEGER NOT NULL DEFAULT 0,     -- threads published this month
  vote_count      INTEGER NOT NULL DEFAULT 0,     -- helpful votes received this month
  weight          NUMERIC(12,4) NOT NULL DEFAULT 0, -- normalized share weight
  share_twd       INTEGER NOT NULL DEFAULT 0,     -- computed payout amount
  payout_status   VARCHAR(16) NOT NULL DEFAULT 'unpaid', -- unpaid | paid
  paid_at         TIMESTAMP WITH TIME ZONE,
  payout_note     TEXT,                           -- admin note: bank ref / method
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE (pool_id, therapist_id),
  CONSTRAINT qa_revenue_shares_payout_status_valid CHECK (payout_status IN ('unpaid', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_qa_revenue_shares_pool
  ON qa_revenue_shares(pool_id);

CREATE INDEX IF NOT EXISTS idx_qa_revenue_shares_therapist
  ON qa_revenue_shares(therapist_id, created_at DESC);
