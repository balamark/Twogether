-- One entitlement per paid order.
--
-- Both gateways deliver their notify more than once (retries, plus the browser
-- ReturnURL racing the server-to-server NotifyURL). routes/billing.js checked
-- `status = 'paid'` before opening its transaction, so two deliveries could
-- both pass that check and both insert into couple_entitlements — one payment,
-- N grants of the same Premium days. The receipt never duplicated because
-- payment_receipts has UNIQUE(source, order_id); this gives the entitlement
-- ledger the same protection.
--
-- Partial, because coupon redemptions legitimately carry order_id IS NULL and
-- must stay unconstrained (there can be many of those per couple).
--
-- Any historical duplicates are left untouched: they are granted time a couple
-- already has, and rewriting paid history to satisfy a new index would be worse
-- than carrying it. The index is created only over rows that don't conflict.
DO $$
DECLARE
  dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT order_id FROM couple_entitlements
     WHERE order_id IS NOT NULL
     GROUP BY order_id HAVING COUNT(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE WARNING 'couple_entitlements: % order(s) already have duplicate grants; '
                  'leaving them in place and skipping the unique index. Reconcile '
                  'them manually, then re-run this migration.', dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_couple_entitlements_one_per_order
      ON couple_entitlements(order_id)
      WHERE order_id IS NOT NULL;
  END IF;
END $$;
