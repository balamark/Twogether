-- Coupon codes that grant a free, time-boxed Premium pass (no payment).
--
-- Reuses the same per-couple ledger as paid passes: redeeming a coupon inserts
-- a row into couple_entitlements (order_id stays NULL since there is no
-- payment_order). A couple is "premium" while it holds an unexpired
-- entitlement, so coupons and paid passes raise the exact same usage caps.
-- Coupon grants STACK on top of any existing pass, mirroring the paid flow.

CREATE TABLE IF NOT EXISTS coupons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(40) NOT NULL UNIQUE,            -- stored UPPERCASE
  days            INTEGER NOT NULL DEFAULT 30,            -- Premium days granted
  max_redemptions INTEGER,                                -- NULL = unlimited (still 1 per couple)
  redeemed_count  INTEGER NOT NULL DEFAULT 0,
  expires_at      TIMESTAMP WITH TIME ZONE,               -- coupon validity window; NULL = never expires
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  note            TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- One redemption per couple per coupon — the UNIQUE constraint is the
-- authoritative guard against a couple redeeming the same code twice (even
-- under a race), backing the explicit pre-check in the route.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id      UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  couple_id      UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  redeemed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  entitlement_id UUID REFERENCES couple_entitlements(id) ON DELETE SET NULL,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (coupon_id, couple_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_couple
  ON coupon_redemptions(couple_id);

-- Launch promo: 30 days free Premium, unlimited couples (one redemption each).
INSERT INTO coupons (code, days, max_redemptions, note)
VALUES ('WELCOME30', 30, NULL, 'Launch promo: 30 days free Premium')
ON CONFLICT (code) DO NOTHING;
