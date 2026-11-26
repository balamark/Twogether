const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { logWarn } = require('../lib/logger');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

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

const USER_CACHE_TTL_MS = 60_000;
const USER_CACHE_MAX = 5000;
const userCache = new Map();
const userCacheEnabled = process.env.NODE_ENV !== 'test';

const loadUser = async (userId) => {
  if (userCacheEnabled) {
    const hit = userCache.get(userId);
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

const isRevoked = (decoded, passwordChangedAt) => {
  if (!passwordChangedAt || typeof decoded.iat !== 'number') return false;
  return Math.floor(new Date(passwordChangedAt).getTime() / 1000) > decoded.iat;
};

const invalidateUserCache = (userId) => {
  userCache.delete(userId);
};

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
      error_code: 'TOKEN_MISSING'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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
