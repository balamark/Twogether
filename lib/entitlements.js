const db = require('../database/db');
const { logWarn } = require('./logger');

const UNLIMITED = Number.POSITIVE_INFINITY;

const TEST_MODE = process.env.NODE_ENV === 'test';
const freeDefault = (envVal, prod) => Number(envVal || (TEST_MODE ? 1_000_000 : prod));

const FEATURE_LIMITS = {
  free: {
    icebreaker_per_day: freeDefault(process.env.EVENTS_AI_DAILY_LIMIT, 5),
    custom_scripts_total: freeDefault(process.env.FREE_CUSTOM_SCRIPTS_LIMIT, 3),
    photo_uploads_total: freeDefault(process.env.FREE_PHOTO_UPLOADS_LIMIT, 30),
  },
  premium: {
    icebreaker_per_day: Number(process.env.PREMIUM_AI_DAILY_LIMIT || 50),
    custom_scripts_total: UNLIMITED,
    photo_uploads_total: UNLIMITED,
  },
};

const LIMIT_ERROR_CODE = {
  icebreaker_per_day: 'AI_DAILY_LIMIT_REACHED',
  custom_scripts_total: 'SCRIPT_LIMIT_REACHED',
  photo_uploads_total: 'PHOTO_LIMIT_REACHED',
};

async function getCoupleIdForUser(userId) {
  const result = await db.query(
    'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
    [userId]
  );
  return result.rows[0]?.id || null;
}

async function getCoupleTier(coupleId) {
  if (!coupleId) return 'free';
  try {
    const result = await db.query(
      `SELECT 1 FROM couple_entitlements
        WHERE couple_id = $1 AND expires_at > NOW()
        LIMIT 1`,
      [coupleId]
    );
    return result.rows.length > 0 ? 'premium' : 'free';
  } catch (err) {
    logWarn('getCoupleTier failed, defaulting to free', { err: err.message });
    return 'free';
  }
}

async function getActiveExpiry(coupleId) {
  if (!coupleId) return null;
  try {
    const result = await db.query(
      `SELECT MAX(expires_at) AS expires_at
         FROM couple_entitlements
        WHERE couple_id = $1 AND expires_at > NOW()`,
      [coupleId]
    );
    return result.rows[0]?.expires_at || null;
  } catch (err) {
    logWarn('getActiveExpiry failed', { err: err.message });
    return null;
  }
}

function getLimit(tier, key) {
  const limit = FEATURE_LIMITS[tier]?.[key];
  return limit === undefined ? FEATURE_LIMITS.free[key] : limit;
}

function checkLimit({ tier, key, used }) {
  const limit = getLimit(tier, key);
  if (used < limit) return { ok: true };
  return {
    ok: false,
    status: 429,
    body: {
      success: false,
      message: limitMessage(key, limit),
      error_code: LIMIT_ERROR_CODE[key] || 'LIMIT_REACHED',
      limit: Number.isFinite(limit) ? limit : null,
      used,
      tier,
    },
  };
}

function limitMessage(key, limit) {
  switch (key) {
    case 'icebreaker_per_day':
      return `今日 AI 整理次數已達上限（${limit} 次／天），升級 Premium 可提高上限`;
    case 'custom_scripts_total':
      return `免費方案最多建立 ${limit} 個自訂劇本，升級 Premium 即可無限建立`;
    case 'photo_uploads_total':
      return `免費方案最多上傳 ${limit} 張照片，升級 Premium 即可無限上傳`;
    default:
      return '已達免費方案上限，升級 Premium 可解除限制';
  }
}

module.exports = {
  UNLIMITED,
  FEATURE_LIMITS,
  LIMIT_ERROR_CODE,
  getCoupleIdForUser,
  getCoupleTier,
  getActiveExpiry,
  getLimit,
  checkLimit,
};
