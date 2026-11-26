const crypto = require('crypto');

const VERSION = 'u1';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is required to sign unsubscribe links');
  return s;
}

function digest(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function signUnsubscribeToken(userId) {
  if (!userId) return null;
  try {
    const payload = `${VERSION}.${userId}`;
    return `${payload}.${digest(payload)}`;
  } catch {
    return null;
  }
}

function verifyUnsubscribeToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [version, userId, sig] = parts;
  if (version !== VERSION || !userId || !sig) return null;
  try {
    const expected = digest(`${version}.${userId}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return userId;
  } catch {
    return null;
  }
}

module.exports = { signUnsubscribeToken, verifyUnsubscribeToken };
