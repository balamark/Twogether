const crypto = require('crypto');
const { logWarn } = require('../lib/logger');

function timingSafeEqualSecret(provided, expected) {
  const a = crypto.createHash('sha256').update(String(provided), 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(expected), 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function bearerToken(header) {
  if (typeof header !== 'string') return '';
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : '';
}

function botAuth(req, res, next) {
  const expected = (process.env.MARKETPLACE_BOT_API_KEY || '').trim();
  if (!expected) {
    logWarn('marketplace_bot.disabled');
    return res.status(503).json({
      success: false,
      message: '劇本上傳 API 尚未設定。請在伺服器環境變數設定 MARKETPLACE_BOT_API_KEY 後再試。',
      error_code: 'BOT_API_DISABLED',
    });
  }

  const provided = bearerToken(req.headers.authorization || '');
  if (!timingSafeEqualSecret(provided, expected)) {
    logWarn('marketplace_bot.unauthorized', {
      hasAuthorization: Boolean(req.headers.authorization),
    });
    return res.status(401).json({
      success: false,
      message: '需要有效的 Bearer API 金鑰。請在 Authorization 標頭帶上伺服器核發的金鑰。',
      error_code: 'BOT_API_UNAUTHORIZED',
    });
  }

  return next();
}

module.exports = { botAuth, timingSafeEqualSecret };
