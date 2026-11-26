const crypto = require('crypto');
const { logWarn } = require('../lib/logger');

const REALM = 'Twogether Admin';

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function unauthorized(res, message) {
  res.set('WWW-Authenticate', `Basic realm="${REALM}", charset="UTF-8"`);
  return res.status(401).send(message || 'Authentication required');
}

function adminAuth(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    logWarn('ADMIN_PASSWORD not set; refusing admin access');
    return res.status(503).send('Admin disabled: ADMIN_PASSWORD not configured');
  }

  const header = req.headers['authorization'] || '';
  if (!header.toLowerCase().startsWith('basic ')) {
    return unauthorized(res);
  }

  let decoded;
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return unauthorized(res);
  }

  const idx = decoded.indexOf(':');
  if (idx === -1) return unauthorized(res);
  const provided = decoded.slice(idx + 1);

  if (!timingSafeEqualStr(provided, expected)) {
    return unauthorized(res);
  }

  next();
}

module.exports = { adminAuth };
