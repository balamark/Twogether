const ecpay = require('./ecpay');
const newebpay = require('./newebpay');

const pickProvider = (requested) => {
  if (requested === 'ecpay' || requested === 'newebpay') return requested;
  return ecpay.isConfigured() ? 'ecpay' : 'newebpay';
};

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
