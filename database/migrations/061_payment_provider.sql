-- Payment provider column (multi-gateway support).
--
-- We now offer two Taiwanese payment gateways side by side: 綠界 ECPay (the
-- original) and 藍新金流 NewebPay. Both flows reuse the same order tables and the
-- same per-couple / per-session grant logic; only the signing + redirect differ.
-- This column records which gateway a given order went through so the matching
-- server-to-server callback verifier is unambiguous and audits stay clear.
--
-- 'ecpay' is the default so every existing row keeps its correct provenance.
-- Note: the *_trade_no column (ecpay_trade_no) is now the generic gateway trade
-- number — for NewebPay it holds NewebPay's TradeNo.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS provider VARCHAR(16) NOT NULL DEFAULT 'ecpay';

ALTER TABLE session_payment_orders
  ADD COLUMN IF NOT EXISTS provider VARCHAR(16) NOT NULL DEFAULT 'ecpay';
