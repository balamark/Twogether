// 諮商師專屬邀請碼 (therapist referral codes) — shared logic.
//
// A therapist hands their code/link to the couples they already see. The
// referred couple gets REFERRAL_PREMIUM_DAYS of Premium once they're paired,
// and each rewarded couple lowers the therapist's platform fee on paid video
// sessions by FEE_DISCOUNT_PER_COUPLE points (capped, never below FEE_FLOOR).
// Schema: database/migrations/114_therapist_referrals.sql.

const crypto = require('crypto');
const db = require('../database/db');
const { logInfo, logWarn } = require('./logger');

const REFERRAL_PREMIUM_DAYS = 30;
const FEE_DISCOUNT_PER_COUPLE = 1; // percentage points per rewarded couple
const FEE_DISCOUNT_MAX = 10;       // at most 10 points off
const FEE_FLOOR = 5;               // the platform never keeps less than 5%

// No 0/O/1/I/L — codes get read aloud in a therapy room.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^T[A-Z0-9]{6}$/;

function generateCode() {
  const bytes = crypto.randomBytes(6);
  let out = 'T';
  for (let i = 0; i < 6; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function normalizeCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

// The therapist's code, minted on first ask. Retries on the (unlikely) unique
// collision; a concurrent mint for the same therapist keeps whichever landed.
async function ensureCodeForTherapist(therapistId) {
  const cur = await db.query(`SELECT referral_code FROM therapists WHERE id = $1`, [therapistId]);
  if (cur.rows[0]?.referral_code) return cur.rows[0].referral_code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      const r = await db.query(
        `UPDATE therapists SET referral_code = COALESCE(referral_code, $2)
          WHERE id = $1 RETURNING referral_code`,
        [therapistId, code]
      );
      return r.rows[0]?.referral_code || null;
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  }
  throw new Error('could not mint a unique referral code');
}

async function findTherapistByCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const r = await db.query(
    `SELECT id, user_id, display_name, title, photo_url, status
       FROM therapists WHERE referral_code = $1`,
    [normalized]
  );
  const t = r.rows[0];
  return t && t.status === 'approved' ? t : null;
}

async function countRewardedReferrals(therapistId) {
  const r = await db.query(
    `SELECT COUNT(*)::int AS c FROM therapist_referrals
      WHERE therapist_id = $1 AND status = 'rewarded'`,
    [therapistId]
  );
  return r.rows[0]?.c || 0;
}

// Percentage points off the platform fee for `rewardedCount` referred couples.
function feeDiscountFor(rewardedCount) {
  return Math.min(FEE_DISCOUNT_MAX, Math.max(0, rewardedCount) * FEE_DISCOUNT_PER_COUPLE);
}

function applyFeeDiscount(baseRate, discount) {
  return Math.max(FEE_FLOOR, Math.min(baseRate, baseRate - discount));
}

// Record that `userId` came through `therapist`'s code (first therapist wins)
// and, when the user is already paired, grant the couple's Premium month.
// Returns { status, referral, days?, expiresAt? } where status is one of:
//   'rewarded'          — Premium granted just now
//   'already_rewarded'  — this couple already got its referral month
//   'pending_pair'      — recorded; Premium arrives once they pair
//   'other_therapist'   — user was already referred by a different therapist
async function claimReferral({ userId, therapist }) {
  const userRow = await db.query(`SELECT created_at FROM users WHERE id = $1`, [userId]);
  const createdAt = userRow.rows[0]?.created_at ? new Date(userRow.rows[0].created_at) : null;
  const newUser = !!createdAt && Date.now() - createdAt.getTime() < 24 * 60 * 60 * 1000;

  await db.query(
    `INSERT INTO therapist_referrals (therapist_id, user_id, new_user)
     VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`,
    [therapist.id, userId, newUser]
  );
  const refRow = await db.query(`SELECT * FROM therapist_referrals WHERE user_id = $1`, [userId]);
  const referral = refRow.rows[0];
  if (referral.therapist_id !== therapist.id) {
    return { status: 'other_therapist', referral };
  }
  if (referral.status === 'rewarded') {
    return { status: 'already_rewarded', referral };
  }

  // Only a PAIRED couple (user2 set) gets the month — a solo draft couple
  // would otherwise burn it before the partner joins.
  const coupleRow = await db.query(
    `SELECT id FROM couples
      WHERE (user1_id = $1 OR user2_id = $1) AND user2_id IS NOT NULL`,
    [userId]
  );
  const coupleId = coupleRow.rows[0]?.id || null;
  if (!coupleId) {
    logInfo('therapist_referral.pending_pair', { userId, therapistId: therapist.id, newUser });
    return { status: 'pending_pair', referral };
  }

  // The partner may have claimed the same (or another) therapist's code first.
  const coupleRewarded = await db.query(
    `SELECT 1 FROM therapist_referrals WHERE couple_id = $1 AND status = 'rewarded'`,
    [coupleId]
  );
  if (coupleRewarded.rows.length) {
    await db.query(`UPDATE therapist_referrals SET couple_id = $2 WHERE id = $1`, [referral.id, coupleId]);
    return { status: 'already_rewarded', referral };
  }

  let expiresAt = null;
  try {
    await db.transaction(async (client) => {
      const expiryRow = await client.query(
        `SELECT MAX(expires_at) AS max_exp FROM couple_entitlements
          WHERE couple_id = $1 AND expires_at > NOW()`,
        [coupleId]
      );
      const currentMax = expiryRow.rows[0]?.max_exp || null;
      // Stack on any active pass — never throw away paid time.
      const ent = await client.query(
        `INSERT INTO couple_entitlements (couple_id, plan, starts_at, expires_at, order_id)
         SELECT $1, 'therapist_ref', s, s + make_interval(days => $2), NULL
           FROM (SELECT GREATEST(NOW(), COALESCE($3::timestamptz, NOW())) AS s) t
         RETURNING id, expires_at`,
        [coupleId, REFERRAL_PREMIUM_DAYS, currentMax]
      );
      expiresAt = ent.rows[0].expires_at;
      await client.query(
        `UPDATE therapist_referrals
            SET couple_id = $2, entitlement_id = $3, status = 'rewarded', rewarded_at = NOW()
          WHERE id = $1`,
        [referral.id, coupleId, ent.rows[0].id]
      );
    });
  } catch (err) {
    // The partial unique index lost a race with the partner's claim.
    if (err.code === '23505') return { status: 'already_rewarded', referral };
    throw err;
  }

  logInfo('therapist_referral.rewarded', {
    userId, coupleId, therapistId: therapist.id, days: REFERRAL_PREMIUM_DAYS, newUser,
  });
  return { status: 'rewarded', referral: { ...referral, couple_id: coupleId }, days: REFERRAL_PREMIUM_DAYS, expiresAt };
}

// Called right after two users pair: grant any referral month that was
// waiting on the pairing. Best-effort — pairing must never fail because of it.
async function rewardPendingForUsers(userIds) {
  try {
    const r = await db.query(
      `SELECT tr.user_id, t.id, t.user_id AS therapist_user_id, t.display_name, t.status
         FROM therapist_referrals tr JOIN therapists t ON t.id = tr.therapist_id
        WHERE tr.user_id = ANY($1) AND tr.status = 'pending' AND t.status = 'approved'
        ORDER BY tr.created_at`,
      [userIds.filter(Boolean)]
    );
    for (const row of r.rows) {
      const result = await claimReferral({ userId: row.user_id, therapist: row });
      if (result.status === 'rewarded') break; // one month per couple
    }
  } catch (err) {
    logWarn('therapist_referral.reward_on_pair_failed', { err: err.message });
  }
}

// Referral stats for the therapist's own dashboard.
async function referralStatsFor(therapistId) {
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'rewarded')::int AS rewarded,
              COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
         FROM therapist_referrals WHERE therapist_id = $1`,
      [therapistId]
    );
    return r.rows[0] || { total: 0, rewarded: 0, pending: 0 };
  } catch (err) {
    logWarn('therapist_referral.stats_failed', { therapistId, err: err.message });
    return { total: 0, rewarded: 0, pending: 0 };
  }
}

module.exports = {
  REFERRAL_PREMIUM_DAYS,
  FEE_DISCOUNT_PER_COUPLE,
  FEE_DISCOUNT_MAX,
  FEE_FLOOR,
  normalizeCode,
  ensureCodeForTherapist,
  findTherapistByCode,
  countRewardedReferrals,
  feeDiscountFor,
  applyFeeDiscount,
  claimReferral,
  rewardPendingForUsers,
  referralStatsFor,
};
