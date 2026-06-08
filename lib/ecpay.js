// Minimal ECPay (綠界) All-in-One checkout helper.
//
// Deliberately dependency-free: the only non-trivial part of ECPay is the
// CheckMacValue signature, which is a well-defined algorithm we implement and
// comment here rather than pulling in a heavy SDK. This keeps the payment path
// fully reviewable — important for money-handling code.
//
// Signature algorithm (ECPay AIO, EncryptType=1 / SHA256):
//   1. Drop CheckMacValue; sort remaining params by key (case-insensitive A→Z).
//   2. Build  HashKey=<key>&k1=v1&k2=v2&...&HashIV=<iv>
//   3. URL-encode the whole string .NET-style and lowercase it.
//   4. SHA256 the result; uppercase the hex digest.
//
// Config comes from env (never commit these):
//   ECPAY_MERCHANT_ID, ECPAY_HASH_KEY, ECPAY_HASH_IV, ECPAY_MODE(stage|production)

const crypto = require('crypto');

const ENDPOINTS = {
  stage: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  production: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
};

function config() {
  const mode = process.env.ECPAY_MODE === 'production' ? 'production' : 'stage';
  return {
    mode,
    actionUrl: ENDPOINTS[mode],
    // ECPay-published stage test credentials are the safe default so dev/staging
    // works out of the box; production MUST set its own.
    merchantId: process.env.ECPAY_MERCHANT_ID || '2000132',
    hashKey: process.env.ECPAY_HASH_KEY || '5294y06JbISpM5x9',
    hashIV: process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxNNIS',
  };
}

// .NET HttpUtility.UrlEncode-compatible encoding, the format ECPay hashes.
// Differences from JS encodeURIComponent that we reconcile:
//   - space: encodeURIComponent → %20, .NET → '+'
//   - ~ and ' : encodeURIComponent leaves literal, .NET encodes them (%7e, %27)
// encodeURIComponent already leaves -_.!*() literal, which matches ECPay's
// post-urlencode "convert these back to literal" step, so those need no work.
// Final string is lowercased to match .NET's lowercase hex (and ECPay's spec).
function dotNetUrlEncode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27')
    .toLowerCase();
}

function genCheckMacValue(params, hashKey, hashIV) {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  let raw = `HashKey=${hashKey}`;
  for (const k of sortedKeys) raw += `&${k}=${params[k]}`;
  raw += `&HashIV=${hashIV}`;

  const encoded = dotNetUrlEncode(raw);
  return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

// Build the full param set (incl. CheckMacValue) for an AioCheckOut redirect.
// The caller renders these as a self-submitting <form> pointed at actionUrl.
//
// opts: { merchantTradeNo, amount, itemName, tradeDesc, returnUrl,
//         clientBackUrl, orderResultUrl }
function buildCheckoutParams(opts) {
  const { merchantId, hashKey, hashIV, actionUrl } = config();

  // ECPay wants this exact local format: YYYY/MM/DD HH:mm:ss
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const tradeDate = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(
    now.getDate()
  )} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const params = {
    MerchantID: merchantId,
    MerchantTradeNo: opts.merchantTradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: String(opts.amount),
    TradeDesc: opts.tradeDesc || 'Twogether Premium',
    ItemName: opts.itemName,
    ReturnURL: opts.returnUrl, // server-to-server, authoritative
    ChoosePayment: 'ALL', // shows credit card + LINE Pay + others
    EncryptType: 1, // SHA256
  };
  if (opts.clientBackUrl) params.ClientBackURL = opts.clientBackUrl;
  if (opts.orderResultUrl) params.OrderResultURL = opts.orderResultUrl; // browser POST-back

  params.CheckMacValue = genCheckMacValue(params, hashKey, hashIV);
  return { actionUrl, params };
}

// Verify a callback's CheckMacValue against everything else in the payload.
function verifyCallback(payload) {
  const { hashKey, hashIV } = config();
  const received = payload.CheckMacValue;
  if (!received) return false;
  const expected = genCheckMacValue(payload, hashKey, hashIV);
  return expected === String(received).toUpperCase();
}

module.exports = {
  config,
  genCheckMacValue,
  buildCheckoutParams,
  verifyCallback,
  ENDPOINTS,
};
