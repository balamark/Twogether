// Shared gateway rules for every checkout (Premium in routes/billing.js, paid
// video sessions in routes/therapists.js) so both refuse a gateway the same way.
const ecpay = require('./ecpay');
const newebpay = require('./newebpay');

// Which gateway a checkout uses. An explicit choice wins; otherwise ECPay only
// while it's actually configured (lib/ecpay.js isConfigured — production needs
// the real merchant keys), else NewebPay.
const pickProvider = (requested) => {
  if (requested === 'ecpay' || requested === 'newebpay') return requested;
  return ecpay.isConfigured() ? 'ecpay' : 'newebpay';
};

// null when `provider` can take payments now, else the 503 body to send. The
// message only points at the other gateway when that one is usable.
const providerUnavailable = (provider) => {
  if (provider === 'ecpay' && !ecpay.isConfigured()) {
    return {
      error_code: 'ECPAY_UNAVAILABLE',
      message: newebpay.isConfigured()
        ? '綠界 ECPay 尚未開放，請改用藍新金流付款'
        : '線上付款暫時無法使用，請稍後再試或聯絡客服',
    };
  }
  if (provider === 'newebpay' && !newebpay.isConfigured()) {
    return {
      error_code: 'NEWEBPAY_UNAVAILABLE',
      message: ecpay.isConfigured()
        ? '藍新金流暫時無法使用，請改用綠界 ECPay 付款'
        : '線上付款暫時無法使用，請稍後再試或聯絡客服',
    };
  }
  return null;
};

module.exports = { pickProvider, providerUnavailable };
