-- Premium passes (freemium = usage quotas).
--
-- Premium is sold as one-time, time-boxed passes (30 / 90 / 365 days), NOT an
-- auto-recurring subscription. This fits an individual (個人) ECPay merchant —
-- recurring 定期定額 generally needs a 商業登記/行號 — and maps onto the same
-- per-couple ledger pattern already used by coin_transactions.
--
-- Billing unit is the COUPLE, not the user: when one partner pays, the whole
-- couple's usage caps are raised. A couple is "premium" iff it has a row in
-- couple_entitlements whose expires_at is still in the future. Nothing is ever
-- deleted on lapse — only the caps the app applies change.

-- Pending/paid order records. One row per checkout attempt. merchant_trade_no
-- is OUR id sent to ECPay (their MerchantTradeNo) and is what we match the
-- server-to-server callback against; it is unique so the callback is idempotent.
CREATE TABLE IF NOT EXISTS payment_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id         UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  merchant_trade_no VARCHAR(32) NOT NULL UNIQUE,
  plan              VARCHAR(16) NOT NULL,            -- pass_30 | pass_90 | pass_365
  amount            INTEGER NOT NULL,               -- TWD, integer
  status            VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | paid | failed
  payment_method    VARCHAR(32),                    -- ECPay PaymentType (Credit_CreditCard, etc.)
  ecpay_trade_no    VARCHAR(32),                    -- ECPay's TradeNo from the callback
  raw_callback      JSONB,                          -- full callback payload, for audit
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_couple
  ON payment_orders(couple_id, created_at DESC);

-- Granted passes. One row per successful purchase. Active = NOW() < expires_at.
-- Passes stack: a new pass starts at max(NOW(), current furthest expires_at) so
-- buying again while still premium never throws away paid time.
CREATE TABLE IF NOT EXISTS couple_entitlements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id  UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  plan       VARCHAR(16) NOT NULL,
  starts_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  order_id   UUID REFERENCES payment_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_couple_entitlements_active
  ON couple_entitlements(couple_id, expires_at DESC);
