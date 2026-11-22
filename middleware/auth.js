const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { logWarn } = require('../lib/logger');

// Session TTL is sourced from JWT_EXPIRES_IN (e.g. "7d", "24h", "30m").
// Falls back to 7d for parity with the original hard-coded value. The session
// cookie maxAge in server.js should stay in sync with this value.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Parse simple "<n><unit>" duration strings to milliseconds. Supports s/m/h/d.
// Returns null if the value can't be parsed (caller falls back to a default).
const parseDurationMs = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+)\s*([smhd])$/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * multipliers[unit];
};

const JWT_EXPIRES_IN_MS = parseDurationMs(JWT_EXPIRES_IN) || 7 * 86_400_000;

// Short-lived cache of the authenticated user's row. Every API call runs this
// middleware, so without it each tap paid an extra database round trip before
// the route even started. Entries expire after USER_CACHE_TTL_MS; routes that
// change a cached field (nickname/email) or delete a user call
// invalidateUserCache so the change is visible immediately. Disabled under
// NODE_ENV=test, where suites delete users directly in the database.
const USER_CACHE_TTL_MS = 60_000;
const USER_CACHE_MAX = 5000;
const userCache = new Map(); // userId → { user, expires }
const userCacheEnabled = process.env.NODE_ENV !== 'test';

// Returns { user, passwordChangedAt } (both null when the user is gone).
// passwordChangedAt stays out of req.user so it never ends up in a response.
const loadUser = async (userId) => {
  if (userCacheEnabled) {
    const hit = userCache.get(userId);
    // A copy, so a route that mutates req.user can't poison the cache.
    if (hit && hit.expires > Date.now()) return { user: { ...hit.user }, passwordChangedAt: hit.passwordChangedAt };
  }
  const userResult = await db.query(
    'SELECT id, nickname, email, created_at, password_changed_at FROM users WHERE id = $1',
    [userId]
  );
  const row = userResult.rows[0];
  if (!row) return { user: null, passwordChangedAt: null };
  const { password_changed_at: passwordChangedAt, ...user } = row;
  if (userCacheEnabled) {
    if (userCache.size >= USER_CACHE_MAX) userCache.clear();
    userCache.set(userId, { user: { ...user }, passwordChangedAt, expires: Date.now() + USER_CACHE_TTL_MS });
  }
  return { user, passwordChangedAt };
};

// A token issued before the last password change is dead: resetting the
// password must sign out every other device (migration 118). iat is in whole
// seconds, so compare at second precision — the login that follows a reset in
// the same second still works.
const isRevoked = (decoded, passwordChangedAt) => {
  if (!passwordChangedAt || typeof decoded.iat !== 'number') return false;
  return Math.floor(new Date(passwordChangedAt).getTime() / 1000) > decoded.iat;
};

const invalidateUserCache = (userId) => {
  userCache.delete(userId);
};

// JWT middleware to verify tokens
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
      error_code: 'TOKEN_MISSING'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user details (cached briefly — see loadUser)
    const { user, passwordChangedAt } = await loadUser(decoded.userId);

    if (user && isRevoked(decoded, passwordChangedAt)) {
      logWarn('Token rejected: issued before password change', { userId: user.id });
      return res.status(401).json({
        success: false,
        message: '你的密碼已經變更，請用新密碼重新登入',
        error_code: 'TOKEN_REVOKED'
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found',
        error_code: 'TOKEN_INVALID'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logWarn('Token verification failed', { name: error.name, err: error.message });
    const isExpired = error && error.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      message: isExpired ? 'Session expired' : 'Invalid token',
      error_code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
    });
  }
};

// Optional auth middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { user, passwordChangedAt } = await loadUser(decoded.userId);
    req.user = user && !isRevoked(decoded, passwordChangedAt) ? user : null;
  } catch (error) {
    req.user = null;
  }

  next();
};

// Generate JWT token. Returns { token, expiresAt } where expiresAt is an ISO
// timestamp the client can use to schedule a proactive logout.
const generateToken = (userId) => {
  const token = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  const expiresAt = new Date(Date.now() + JWT_EXPIRES_IN_MS).toISOString();
  return { token, expiresAt };
};

module.exports = {
  authenticateToken,
  invalidateUserCache,
  optionalAuth,
  generateToken,
  JWT_EXPIRES_IN,
  JWT_EXPIRES_IN_MS
};
