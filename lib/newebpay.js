// Minimal 藍新金流 (NewebPay) MPG checkout helper.
//
// Mirrors lib/ecpay.js: deliberately dependency-free so the money-handling path
// stays fully reviewable. NewebPay's MPG gateway differs from ECPay in how it
// signs requests — instead of a single CheckMacValue hash, the order payload is
// AES-256-CBC encrypted (TradeInfo) and a SHA256 hash of that ciphertext is sent
// alongside (TradeSha). The callback comes back the same way and we reverse it.
//
// Signature algorithm (NewebPay MPG):
//   Request:
//     1. Build the order fields as a urlencoded query string (plaintext).
//     2. AES-256-CBC encrypt with key=HashKey, iv=HashIV, PKCS7 padding → hex.
//        This hex string is TradeInfo.
//     3. TradeSha = SHA256("HashKey=" + key + "&" + TradeInfo + "&HashIV=" + iv),
//        uppercased.
//     4. POST { MerchantID, TradeInfo, TradeSha, Version } to the gateway.
//   Callback (NotifyURL, server-to-server — authoritative):
//     NewebPay POSTs { Status, MerchantID, TradeInfo, TradeSha, Version }.
//     Recompute TradeSha over the received TradeInfo to verify, then AES-decrypt
//     TradeInfo to recover the JSON result (Amt, TradeNo, MerchantOrderNo, …).
//
// Config comes from env (never commit these):
//   NEWEBPAY_MERCHANT_ID, NEWEBPAY_HASH_KEY, NEWEBPAY_HASH_IV,
//   NEWEBPAY_MODE(stage|production)

const crypto = require('crypto');

const ENDPOINTS = {
  // NewebPay's test gateway lives on the ccore.* host; production on core.*.
  stage: 'https://ccore.newebpay.com/MPG/mpg_gateway',
  production: 'https://core.newebpay.com/MPG/mpg_gateway',
};

// MPG protocol version we target. 2.0 is the long-stable JSON-result version.
const VERSION = '2.0';

function config() {
  const mode = process.env.NEWEBPAY_MODE === 'production' ? 'production' : 'stage';
  return {
    mode,
    actionUrl: ENDPOINTS[mode],
    // No universal published test credentials (unlike ECPay), so these come from
    // env only. isConfigured() lets callers fail with an actionable message when
    // NewebPay hasn't been set up yet.
    merchantId: process.env.NEWEBPAY_MERCHANT_ID || '',
    hashKey: process.env.NEWEBPAY_HASH_KEY || '',
    hashIV: process.env.NEWEBPAY_HASH_IV || '',
  };
}

// True once the three required NewebPay secrets are present. Routes use this to
// reject a NewebPay checkout cleanly instead of building a broken request.
function isConfigured() {
  const c = config();
  return Boolean(c.merchantId && c.hashKey && c.hashIV);
}

// AES-256-CBC encrypt (PKCS7) → lowercase hex. This is TradeInfo.
function aesEncrypt(plain, key, iv) {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(true);
  return cipher.update(plain, 'utf8', 'hex') + cipher.final('hex');
}

// AES-256-CBC decrypt of a hex TradeInfo. NewebPay pads with PKCS7 but its
// notify payloads sometimes carry trailing control bytes, so we disable Node's
// strict auto-unpadding and strip padding/whitespace defensively before parsing.
function aesDecrypt(hexCipher, key, iv) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  const out = decipher.update(hexCipher, 'hex', 'utf8') + decipher.final('utf8');
  // eslint-disable-next-line no-control-regex
  return out.replace(/[\x00-\x1f\x7f]+$/g, '').trim();
}

function genTradeSha(tradeInfo, hashKey, hashIV) {
  const raw = `HashKey=${hashKey}&${tradeInfo}&HashIV=${hashIV}`;
  return crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
}

// Build the POST params for an MPG redirect. The caller renders these as a
// self-submitting <form> pointed at actionUrl (same pattern as ECPay).
//
// opts: { merchantTradeNo, amount, itemName, returnUrl, orderResultUrl,
//         clientBackUrl, email }
//   returnUrl       → NotifyURL  (server-to-server, authoritative grant)
//   orderResultUrl  → ReturnURL  (browser POST-back after payment)
//   clientBackUrl   → ClientBackURL (the "back to store" button)
function buildCheckoutParams(opts) {
  const { merchantId, hashKey, hashIV, actionUrl } = config();

  const fields = {
    MerchantID: merchantId,
    RespondType: 'JSON',
    TimeStamp: String(Math.floor(Date.now() / 1000)),
    Version: VERSION,
    MerchantOrderNo: opts.merchantTradeNo,
    Amt: String(opts.amount),
    // NewebPay caps ItemDesc at 50 chars; slice defensively so a long item name
    // (e.g. a therapist's display name) can never make the gateway reject it.
    ItemDesc: String(opts.itemName || '').slice(0, 50),
    Email: opts.email || '',
    LoginType: '0', // no NewebPay member login required
    NotifyURL: opts.returnUrl,
    ReturnURL: opts.orderResultUrl || '',
    ClientBackURL: opts.clientBackUrl || '',
    // Enabled payment methods (1 = on). Credit card, ATM/WebATM, convenience
    // store code & barcode. Mirrors the breadth ECPay's ChoosePayment=ALL gives.
    CREDIT: '1',
    WEBATM: '1',
    VACC: '1',
    CVS: '1',
    BARCODE: '1',
  };

  const plain = new URLSearchParams(fields).toString();
  const tradeInfo = aesEncrypt(plain, hashKey, hashIV);
  const tradeSha = genTradeSha(tradeInfo, hashKey, hashIV);

  return {
    actionUrl,
    params: {
      MerchantID: merchantId,
      TradeInfo: tradeInfo,
      TradeSha: tradeSha,
      Version: VERSION,
    },
  };
}

// Verify a callback's TradeSha against its TradeInfo.
function verifyCallback(payload) {
  const { hashKey, hashIV } = config();
  const tradeInfo = payload && payload.TradeInfo;
  const tradeSha = payload && payload.TradeSha;
  if (!tradeInfo || !tradeSha) return false;
  const expected = genTradeSha(tradeInfo, hashKey, hashIV);
  return expected === String(tradeSha).toUpperCase();
}

// Decrypt + normalize a verified callback into the same shape our route logic
// expects regardless of gateway. Returns null if it can't be parsed.
//   { success, status, merchantOrderNo, amount, tradeNo, paymentType, raw }
function parseCallback(payload) {
  const { hashKey, hashIV } = config();
  try {
    const json = JSON.parse(aesDecrypt(payload.TradeInfo, hashKey, hashIV));
    const status = json.Status; // 'SUCCESS' on a paid order
    const result = json.Result || {};
    return {
      success: status === 'SUCCESS',
      status,
      merchantOrderNo: result.MerchantOrderNo || null,
      amount: result.Amt != null ? Number(result.Amt) : null,
      tradeNo: result.TradeNo || null,
      paymentType: result.PaymentType || null,
      raw: json,
    };
  } catch {
    return null;
  }
}

module.exports = {
  config,
  isConfigured,
  buildCheckoutParams,
  verifyCallback,
  parseCallback,
  genTradeSha,
  aesEncrypt,
  aesDecrypt,
  ENDPOINTS,
  VERSION,
};
