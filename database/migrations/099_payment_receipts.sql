-- Electronic receipts (電子收據) for every paid order.
--
-- Why this exists: both Taiwanese gateways we use (綠界 ECPay / 藍新金流 NewebPay)
-- require the merchant to document how the buyer gets a purchase document
-- (憑證) for each transaction. Twogether is currently sold by an individual
-- seller (個人賣家) with no 統一編號 / 稅籍登記, so it cannot issue a 統一發票;
-- what it CAN and must do is issue a numbered electronic receipt per paid
-- transaction, mail it to the buyer and keep it queryable in-app. That is what
-- this table records. Once 稅籍登記 is done, the same row is the natural place
-- to hang an invoice number on (invoice_no below stays NULL until then).
--
-- One receipt per paid order, for BOTH money flows:
--   source = 'premium' → payment_orders (couple Premium passes)
--   source = 'session' → session_payment_orders (paid therapist video sessions)
-- order_id is therefore a soft reference (no FK — it points at one of two
-- tables); UNIQUE(source, order_id) is what makes issuing idempotent, which
-- matters because gateway callbacks retry until they get an ack.
--
-- Nothing here is ever updated or deleted: a receipt is an issued document.
CREATE TABLE IF NOT EXISTS payment_receipts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human-facing document number printed on the receipt, e.g. TG-20260806-A1B2C3.
  receipt_no   VARCHAR(32) NOT NULL UNIQUE,
  source       VARCHAR(16) NOT NULL,           -- premium | session
  order_id     UUID NOT NULL,
  -- Who bought it. SET NULL on user deletion — the receipt itself must survive
  -- for bookkeeping, with the buyer snapshot below carrying the details.
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Buyer snapshot, frozen at issue time so a later nickname/email change never
  -- rewrites an issued document.
  buyer_email  VARCHAR(255),
  buyer_name   VARCHAR(100),
  -- Optional 抬頭 / 統一編號 the buyer typed at checkout (for expense claims).
  buyer_title  VARCHAR(100),
  buyer_tax_id VARCHAR(8),
  item_label   VARCHAR(100) NOT NULL,          -- what was bought, as shown to the buyer
  amount       INTEGER NOT NULL,               -- TWD, integer (gross, what the buyer paid)
  provider     VARCHAR(16),                    -- ecpay | newebpay
  trade_no     VARCHAR(32),                    -- the gateway's own trade id
  -- Reserved for the day 統一發票 issuance is switched on (稅籍登記 done): the
  -- e-invoice number for this same transaction. NULL means "receipt only".
  invoice_no   VARCHAR(20),
  issued_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT payment_receipts_source_valid CHECK (source IN ('premium', 'session')),
  CONSTRAINT payment_receipts_order_unique UNIQUE (source, order_id)
);

-- "My purchase history" lists a buyer's receipts newest-first.
CREATE INDEX IF NOT EXISTS idx_payment_receipts_user
  ON payment_receipts(user_id, issued_at DESC);

-- Optional buyer-supplied receipt details, captured at checkout (before we know
-- whether the payment will succeed) and copied onto the receipt when it issues.
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS receipt_title  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS receipt_tax_id VARCHAR(8);

-- Same table as 063: RLS on, no policies. The backend connects as a
-- rolbypassrls role; this only shuts the Supabase PostgREST/anon path.
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;
