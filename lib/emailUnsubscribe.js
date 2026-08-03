// One-click unsubscribe tokens for the List-Unsubscribe header.
//
// Gmail and Yahoo require bulk senders to offer one-click unsubscribe
// (RFC 8058) and downrank senders who don't — which is part of why our
// notification mail lands in spam. The link has to work without a login, so
// it carries a signed userId rather than a session.
//
// Stateless on purpose: no extra table, no token to expire or clean up. The
// signature is an HMAC over the userId using the existing JWT_SECRET, so a
// secret rotation invalidates every outstanding link (acceptable — the worst
// case is a user clicking an old link and being asked to sign in instead).

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

// Returns a URL-safe token, or null when signing isn't possible (no secret).
// Callers treat null as "omit the one-click header" rather than failing the send.
function signUnsubscribeToken(userId) {
  if (!userId) return null;
  try {
    const payload = `${VERSION}.${userId}`;
    return `${payload}.${digest(payload)}`;
  } catch {
    return null;
  }
}

// Returns the userId when the token is authentic, otherwise null.
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
