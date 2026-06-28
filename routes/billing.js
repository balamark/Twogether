const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { getCoupleIdForUser, getCoupleTier, getActiveExpiry } = require('../lib/entitlements');
const ecpay = require('../lib/ecpay');
const newebpay = require('../lib/newebpay');
const emailService = require('../services/emailService');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();

// Server-side catalog. Prices (TWD) and durations live here only — the client
// NEVER supplies an amount. ItemName is what the buyer sees on ECPay's page.
const PLANS = {
  pass_30: { days: 30, amount: 90, label: 'Twogether Premium 30 天' },
  pass_90: { days: 90, amount: 240, label: 'Twogether Premium 90 天' },
  pass_365: { days: 365, amount: 790, label: 'Twogether Premium 365 天' },
};

function appBaseUrl() {
  // APP_BASE_URL must be the externally reachable origin so ECPay can call back.
  return (process.env.APP_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
}

// ECPay MerchantTradeNo: alphanumeric, <= 20 chars, unique. base36 timestamp +
// random keeps it short and collision-resistant.
function genMerchantTradeNo() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString('hex');
  return `TG${ts}${rand}`.slice(0, 20).toUpperCase();
}

// ---------------------------------------------------------------------------
// Couple's current plan/entitlement status + the purchasable catalog.
// ---------------------------------------------------------------------------
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const coupleId = await getCoupleIdForUser(req.user.id);
    const tier = await getCoupleTier(coupleId);
    const expiresAt = await getActiveExpiry(coupleId);

    res.json({
      success: true,
      tier,
      expires_at: expiresAt,
      has_couple: !!coupleId,
      plans: Object.entries(PLANS).map(([id, p]) => ({
        id,
        days: p.days,
        amount: p.amount,
        label: p.label,
      })),
    });
  } catch (err) {
    logError('Billing status failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法取得訂閱狀態' });
  }
});

// ---------------------------------------------------------------------------
// Redeem a coupon code for a free, time-boxed Premium pass. Grants the same
// per-couple entitlement a paid pass would, with order_id NULL. One redemption
// per couple per coupon (enforced by both a pre-check and a UNIQUE constraint).
// ---------------------------------------------------------------------------
router.post(
  '/redeem-coupon',
  authenticateToken,
  [body('code').isString().trim().isLength({ min: 1, max: 40 }).withMessage('請輸入優惠碼')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: '請輸入優惠碼', errors: errors.array() });
    }

    const code = String(req.body.code).trim().toUpperCase();
    try {
      const coupleId = await getCoupleIdForUser(req.user.id);
      if (!coupleId) {
        return res.status(404).json({
          success: false,
          message: '配對情侶後才能使用優惠碼',
          error_code: 'NO_COMPLETE_COUPLE',
        });
      }

      const couponResult = await db.query(`SELECT * FROM coupons WHERE code = $1`, [code]);
      const coupon = couponResult.rows[0];
      if (!coupon || !coupon.active) {
        return res.status(404).json({ success: false, message: '優惠碼無效', error_code: 'COUPON_INVALID' });
      }
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return res.status(410).json({ success: false, message: '優惠碼已過期', error_code: 'COUPON_EXPIRED' });
      }
      if (coupon.max_redemptions != null && coupon.redeemed_count >= coupon.max_redemptions) {
        return res.status(409).json({ success: false, message: '優惠碼已被兌換完畢', error_code: 'COUPON_EXHAUSTED' });
      }

      let newExpiry = null;
      try {
        await db.transaction(async (client) => {
          // Already redeemed by this couple? (fast path; the UNIQUE constraint
          // is the real guard against a concurrent double-redeem).
          const dup = await client.query(
            `SELECT 1 FROM coupon_redemptions WHERE coupon_id = $1 AND couple_id = $2`,
            [coupon.id, coupleId]
          );
          if (dup.rows.length) {
            const e = new Error('ALREADY_REDEEMED');
            e.handled = 'ALREADY_REDEEMED';
            throw e;
          }

          // Stack on top of any active pass — never throw away existing time.
          const expiryRow = await client.query(
            `SELECT MAX(expires_at) AS max_exp FROM couple_entitlements
              WHERE couple_id = $1 AND expires_at > NOW()`,
            [coupleId]
          );
          const currentMax = expiryRow.rows[0]?.max_exp || null;

          const entRes = await client.query(
            `INSERT INTO couple_entitlements (couple_id, plan, starts_at, expires_at, order_id)
             SELECT $1, $2, s, s + make_interval(days => $3), NULL
               FROM (SELECT GREATEST(NOW(), COALESCE($4::timestamptz, NOW())) AS s) t
             RETURNING id, expires_at`,
            [coupleId, `coupon_${coupon.days}`.slice(0, 16), coupon.days, currentMax]
          );
          newExpiry = entRes.rows[0].expires_at;

          await client.query(
            `INSERT INTO coupon_redemptions (coupon_id, couple_id, redeemed_by, entitlement_id)
             VALUES ($1, $2, $3, $4)`,
            [coupon.id, coupleId, req.user.id, entRes.rows[0].id]
          );
          await client.query(`UPDATE coupons SET redeemed_count = redeemed_count + 1 WHERE id = $1`, [coupon.id]);
        });
      } catch (e) {
        // Both the pre-check and the UNIQUE(coupon_id, couple_id) violation map
        // to the same user-facing "already used" message.
        if (e.handled === 'ALREADY_REDEEMED' || e.code === '23505') {
          return res.status(409).json({
            success: false,
            message: '你們已經使用過這組優惠碼了',
            error_code: 'COUPON_ALREADY_REDEEMED',
          });
        }
        throw e;
      }

      logInfo('billing.coupon.redeemed', { coupleId, userId: req.user.id, code, days: coupon.days });
      res.json({
        success: true,
        message: `已啟用 Premium ${coupon.days} 天`,
        days: coupon.days,
        expires_at: newExpiry,
        tier: 'premium',
      });
    } catch (err) {
      logError('Coupon redeem failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '無法兌換優惠碼，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// Start a checkout. Creates a pending order and returns the ECPay form params
// the frontend auto-submits to redirect the buyer to ECPay's hosted page.
// ---------------------------------------------------------------------------
router.post(
  '/checkout',
  authenticateToken,
  [
    body('plan').isIn(Object.keys(PLANS)).withMessage('無效的方案'),
    body('provider').optional().isIn(['ecpay', 'newebpay']).withMessage('無效的付款方式'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: '驗證失敗', errors: errors.array() });
    }

    const provider = req.body.provider === 'newebpay' ? 'newebpay' : 'ecpay';

    try {
      if (provider === 'newebpay' && !newebpay.isConfigured()) {
        return res.status(503).json({
          success: false,
          message: '藍新金流暫時無法使用，請改用綠界 ECPay 付款',
          error_code: 'NEWEBPAY_UNAVAILABLE',
        });
      }

      const coupleId = await getCoupleIdForUser(req.user.id);
      if (!coupleId) {
        return res.status(404).json({
          success: false,
          message: '您還沒有完整的情侶關係，配對後即可升級',
          error_code: 'NO_COMPLETE_COUPLE',
        });
      }

      const plan = PLANS[req.body.plan];
      const merchantTradeNo = genMerchantTradeNo();

      await db.query(
        `INSERT INTO payment_orders (couple_id, created_by, merchant_trade_no, plan, amount, status, provider)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [coupleId, req.user.id, merchantTradeNo, req.body.plan, plan.amount, provider]
      );

      const base = appBaseUrl();
      const { actionUrl, params } =
        provider === 'newebpay'
          ? newebpay.buildCheckoutParams({
              merchantTradeNo,
              amount: plan.amount,
              itemName: plan.label,
              email: req.user.email || '',
              returnUrl: `${base}/api/billing/newebpay/callback`,
              orderResultUrl: `${base}/api/billing/newebpay/return`,
              clientBackUrl: `${base}/billing/result`,
            })
          : ecpay.buildCheckoutParams({
              merchantTradeNo,
              amount: plan.amount,
              itemName: plan.label,
              tradeDesc: 'Twogether Premium',
              returnUrl: `${base}/api/billing/ecpay/callback`,
              orderResultUrl: `${base}/api/billing/ecpay/return`,
              clientBackUrl: `${base}/billing/result`,
            });

      logInfo('billing.checkout.created', {
        coupleId,
        userId: req.user.id,
        plan: req.body.plan,
        amount: plan.amount,
        merchantTradeNo,
        provider,
      });

      res.json({ success: true, action_url: actionUrl, params });
    } catch (err) {
      logError('Billing checkout failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '無法建立付款，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// Grant a paid order: insert the entitlement (passes STACK so paid time is never
// lost) + mark the order paid, atomically, then fire the receipt email. Shared
// by both gateway callbacks once they've verified the signature, matched the
// order, confirmed it isn't already paid, and confirmed the amount. Idempotent
// at the caller level (callers bail when order.status === 'paid').
//   gatewayTradeNo → the gateway's own trade id (ECPay TradeNo / NewebPay TradeNo)
// Returns true on success, false if the plan is unknown.
// ---------------------------------------------------------------------------
async function grantPaidOrder(order, { gatewayTradeNo, paymentMethod, rawPayload }) {
  const plan = PLANS[order.plan];
  if (!plan) {
    logError('billing.callback.unknown_plan', { merchantTradeNo: order.merchant_trade_no, plan: order.plan });
    return false;
  }

  // All values are bound parameters; the GREATEST/COALESCE handles the "no
  // active pass" case ($4 = NULL → starts now).
  await db.transaction(async (client) => {
    const expiryRow = await client.query(
      `SELECT MAX(expires_at) AS max_exp FROM couple_entitlements
        WHERE couple_id = $1 AND expires_at > NOW()`,
      [order.couple_id]
    );
    const currentMax = expiryRow.rows[0]?.max_exp || null;

    await client.query(
      `INSERT INTO couple_entitlements (couple_id, plan, starts_at, expires_at, order_id)
       SELECT $1, $2, s, s + make_interval(days => $3), $5
         FROM (SELECT GREATEST(NOW(), COALESCE($4::timestamptz, NOW())) AS s) t`,
      [order.couple_id, order.plan, plan.days, currentMax, order.id]
    );

    await client.query(
      `UPDATE payment_orders
          SET status = 'paid', paid_at = NOW(),
              ecpay_trade_no = $2, payment_method = $3, raw_callback = $4
        WHERE id = $1`,
      [order.id, gatewayTradeNo || null, paymentMethod || null, rawPayload]
    );
  });

  logInfo('billing.callback.granted', {
    merchantTradeNo: order.merchant_trade_no,
    coupleId: order.couple_id,
    plan: order.plan,
    days: plan.days,
    provider: order.provider,
  });

  // Fire-and-forget purchase receipt to the buyer. Must never affect the
  // idempotent ack the gateway needs, so it's fully wrapped and awaited-free.
  (async () => {
    try {
      if (!order.created_by) return;
      const buyer = await db.query('SELECT email, nickname FROM users WHERE id = $1', [order.created_by]);
      const b = buyer.rows[0];
      if (!b?.email) return;
      const entRow = await db.query(
        'SELECT expires_at FROM couple_entitlements WHERE order_id = $1 ORDER BY expires_at DESC LIMIT 1',
        [order.id]
      );
      await emailService.sendPaymentReceiptEmail({
        recipientEmail: b.email,
        nickname: b.nickname,
        planLabel: plan.label,
        amountTwd: order.amount,
        days: plan.days,
        orderNo: order.merchant_trade_no,
        paidAt: new Date(),
        expiresAt: entRow.rows[0]?.expires_at || null,
      });
    } catch (err) {
      logWarn('Payment receipt email failed', { merchantTradeNo: order.merchant_trade_no, err: err.message });
    }
  })();

  return true;
}

// ---------------------------------------------------------------------------
// ECPay server-to-server callback (PUBLIC — no JWT). This is the authoritative
// grant. Idempotent: ECPay retries until it gets `1|OK`.
// ---------------------------------------------------------------------------
router.post('/ecpay/callback', async (req, res) => {
  const payload = req.body || {};
  try {
    if (!ecpay.verifyCallback(payload)) {
      logWarn('billing.callback.bad_mac', { merchantTradeNo: payload.MerchantTradeNo });
      return res.status(400).send('0|CheckMacValue Error');
    }

    const merchantTradeNo = payload.MerchantTradeNo;
    const rtnCode = String(payload.RtnCode);

    const orderResult = await db.query(
      `SELECT * FROM payment_orders WHERE merchant_trade_no = $1`,
      [merchantTradeNo]
    );
    const order = orderResult.rows[0];
    if (!order) {
      logWarn('billing.callback.unknown_order', { merchantTradeNo });
      // Ack anyway so ECPay stops retrying an order we don't recognize.
      return res.send('1|OK');
    }

    // Already granted — idempotent ack.
    if (order.status === 'paid') return res.send('1|OK');

    // Guard against amount tampering.
    if (Number(payload.TradeAmt) !== Number(order.amount)) {
      logWarn('billing.callback.amount_mismatch', {
        merchantTradeNo,
        expected: order.amount,
        got: payload.TradeAmt,
      });
      return res.status(400).send('0|Amount Mismatch');
    }

    if (rtnCode !== '1') {
      await db.query(
        `UPDATE payment_orders SET status = 'failed', raw_callback = $2 WHERE id = $1`,
        [order.id, payload]
      );
      logInfo('billing.callback.failed', { merchantTradeNo, rtnCode, msg: payload.RtnMsg });
      return res.send('1|OK');
    }

    await grantPaidOrder(order, {
      gatewayTradeNo: payload.TradeNo,
      paymentMethod: payload.PaymentType,
      rawPayload: payload,
    });

    res.send('1|OK');
  } catch (err) {
    logError('Billing callback failed', { err: err.message, stack: err.stack });
    // Non-2xx so ECPay retries; the grant is idempotent so a retry is safe.
    res.status(500).send('0|Error');
  }
});

// ---------------------------------------------------------------------------
// Browser POST-back after payment (PUBLIC). ECPay POSTs the result to the
// shopper's browser; we can't render the SPA on a POST, so just 302 to the SPA
// result route. The grant already happened via the server-to-server callback.
// ---------------------------------------------------------------------------
router.post('/ecpay/return', (req, res) => {
  const ok = String(req.body?.RtnCode) === '1';
  res.redirect(302, `/billing/result?status=${ok ? 'success' : 'failed'}`);
});

// ---------------------------------------------------------------------------
// NewebPay server-to-server callback (NotifyURL, PUBLIC — no JWT). Authoritative
// grant, mirroring the ECPay callback. NewebPay only needs an HTTP 200 ack.
// ---------------------------------------------------------------------------
router.post('/newebpay/callback', async (req, res) => {
  const payload = req.body || {};
  try {
    if (!newebpay.verifyCallback(payload)) {
      logWarn('billing.callback.bad_mac', { provider: 'newebpay' });
      return res.status(400).send('0|TradeSha Error');
    }

    const parsed = newebpay.parseCallback(payload);
    if (!parsed || !parsed.merchantOrderNo) {
      logWarn('billing.callback.unparsable', { provider: 'newebpay' });
      return res.status(400).send('0|Parse Error');
    }

    const merchantTradeNo = parsed.merchantOrderNo;
    const orderResult = await db.query(
      `SELECT * FROM payment_orders WHERE merchant_trade_no = $1`,
      [merchantTradeNo]
    );
    const order = orderResult.rows[0];
    if (!order) {
      logWarn('billing.callback.unknown_order', { merchantTradeNo, provider: 'newebpay' });
      return res.send('1|OK');
    }

    // Already granted — idempotent ack.
    if (order.status === 'paid') return res.send('1|OK');

    // Guard against amount tampering.
    if (Number(parsed.amount) !== Number(order.amount)) {
      logWarn('billing.callback.amount_mismatch', {
        merchantTradeNo,
        expected: order.amount,
        got: parsed.amount,
        provider: 'newebpay',
      });
      return res.status(400).send('0|Amount Mismatch');
    }

    if (!parsed.success) {
      await db.query(
        `UPDATE payment_orders SET status = 'failed', raw_callback = $2 WHERE id = $1`,
        [order.id, parsed.raw]
      );
      logInfo('billing.callback.failed', { merchantTradeNo, status: parsed.status, provider: 'newebpay' });
      return res.send('1|OK');
    }

    await grantPaidOrder(order, {
      gatewayTradeNo: parsed.tradeNo,
      paymentMethod: parsed.paymentType,
      rawPayload: parsed.raw,
    });

    res.send('1|OK');
  } catch (err) {
    logError('Billing callback failed', { err: err.message, stack: err.stack, provider: 'newebpay' });
    res.status(500).send('0|Error');
  }
});

// ---------------------------------------------------------------------------
// NewebPay browser POST-back (ReturnURL, PUBLIC). Same role as ecpay/return:
// 302 to the SPA result route; the grant already happened via NotifyURL.
// ---------------------------------------------------------------------------
router.post('/newebpay/return', (req, res) => {
  const parsed = newebpay.parseCallback(req.body || {});
  const ok = parsed ? parsed.success : false;
  res.redirect(302, `/billing/result?status=${ok ? 'success' : 'failed'}`);
});

module.exports = router;
module.exports.PLANS = PLANS;
