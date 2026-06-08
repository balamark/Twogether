// Central source of truth for the freemium model (usage quotas).
//
// Premium is per-COUPLE and time-boxed (see migration 040). A couple is
// 'premium' while it holds an unexpired row in couple_entitlements, else 'free'.
// Each tier maps a feature key -> numeric cap. UNLIMITED means "no cap".
//
// To add a new gated feature: add a key to FEATURE_LIMITS here and call
// assertWithinLimit() at the enforcement point. The 429 response shape mirrors
// the one already used for the icebreaker daily limit in routes/events.js so the
// frontend can handle every cap-hit uniformly.

const db = require('../database/db');
const { logWarn } = require('./logger');

const UNLIMITED = Number.POSITIVE_INFINITY;

// The e2e suite shares one test user and creates many scripts/photos across
// specs; under the real free caps that would trip the paywall mid-flow. In test
// mode the free defaults are effectively disabled (still overridable by env).
// The cap behavior itself is covered by tests/upgrade-flow + the entitlement
// integration checks, not by hitting these numbers.
const TEST_MODE = process.env.NODE_ENV === 'test';
const freeDefault = (envVal, prod) => Number(envVal || (TEST_MODE ? 1_000_000 : prod));

// Caps are overridable via env so staging/prod can tune without code changes;
// the in-code numbers are the product definition for the free tier.
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

// error_code returned per feature when a free couple hits its cap. The frontend
// maps any of these to the "upgrade" paywall prompt.
const LIMIT_ERROR_CODE = {
  icebreaker_per_day: 'AI_DAILY_LIMIT_REACHED',
  custom_scripts_total: 'SCRIPT_LIMIT_REACHED',
  photo_uploads_total: 'PHOTO_LIMIT_REACHED',
};

// Resolve the couple id for a user. Mirrors the lookup used across routes
// (routes/coins.js:19). Returns null when the user isn't in a couple.
async function getCoupleIdForUser(userId) {
  const result = await db.query(
    'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
    [userId]
  );
  return result.rows[0]?.id || null;
}

// 'premium' while an unexpired entitlement exists, else 'free'. Fails OPEN to
// 'free' on DB error — we'd rather under-charge than wrongly block a paying
// couple's core flow (same fail-open stance as countTodayIcebreakerUsage).
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

// Furthest-out expiry for a couple, or null if none/expired. Used by the
// billing status endpoint and pass stacking.
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

// Enforce a cap. `used` is the caller's current count for the feature; the call
// is allowed when used < limit. Returns { ok, body, status } so the route can
// `if (!check.ok) return res.status(check.status).json(check.body)`.
//
// limit can be UNLIMITED (premium) -> always ok.
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
