const crypto = require('crypto');

const ENDPOINTS = {
  stage: 'https://ccore.newebpay.com/MPG/mpg_gateway',
  production: 'https://core.newebpay.com/MPG/mpg_gateway',
};

const VERSION = '2.0';

function config() {
  const mode = process.env.NEWEBPAY_MODE === 'production' ? 'production' : 'stage';
  return {
    mode,
    actionUrl: ENDPOINTS[mode],
    merchantId: process.env.NEWEBPAY_MERCHANT_ID || '',
    hashKey: process.env.NEWEBPAY_HASH_KEY || '',
    hashIV: process.env.NEWEBPAY_HASH_IV || '',
  };
}

function isConfigured() {
  const c = config();
  return Boolean(c.merchantId && c.hashKey && c.hashIV);
}

function aesEncrypt(plain, key, iv) {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(true);
  return cipher.update(plain, 'utf8', 'hex') + cipher.final('hex');
}

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

function buildCheckoutParams(opts) {
  const { merchantId, hashKey, hashIV, actionUrl } = config();

  const fields = {
    MerchantID: merchantId,
    RespondType: 'JSON',
    TimeStamp: String(Math.floor(Date.now() / 1000)),
    Version: VERSION,
    MerchantOrderNo: opts.merchantTradeNo,
    Amt: String(opts.amount),
    ItemDesc: String(opts.itemName || '').slice(0, 50),
    Email: opts.email || '',
    LoginType: '0',
    NotifyURL: opts.returnUrl,
    ReturnURL: opts.orderResultUrl || '',
    ClientBackURL: opts.clientBackUrl || '',
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

function verifyCallback(payload) {
  const { hashKey, hashIV } = config();
  const tradeInfo = payload && payload.TradeInfo;
  const tradeSha = payload && payload.TradeSha;
  if (!tradeInfo || !tradeSha) return false;
  const expected = genTradeSha(tradeInfo, hashKey, hashIV);
  return expected === String(tradeSha).toUpperCase();
}

function parseCallback(payload) {
  const { hashKey, hashIV } = config();
  try {
    const json = JSON.parse(aesDecrypt(payload.TradeInfo, hashKey, hashIV));
    const status = json.Status;
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
