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
    merchantId: process.env.ECPAY_MERCHANT_ID || '2000132',
    hashKey: process.env.ECPAY_HASH_KEY || '5294y06JbISpM5x9',
    hashIV: process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxNNIS',
  };
}

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

function buildCheckoutParams(opts) {
  const { merchantId, hashKey, hashIV, actionUrl } = config();

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
    ReturnURL: opts.returnUrl,
    ChoosePayment: 'ALL',
    EncryptType: 1,
  };
  if (opts.clientBackUrl) params.ClientBackURL = opts.clientBackUrl;
  if (opts.orderResultUrl) params.OrderResultURL = opts.orderResultUrl;

  params.CheckMacValue = genCheckMacValue(params, hashKey, hashIV);
  return { actionUrl, params };
}

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
