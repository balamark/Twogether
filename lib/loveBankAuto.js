const db = require('../database/db');
const { logInfo, logWarn } = require('./logger');

const DEFAULT_RATE = 1;

const AUTO_CATEGORIES = ['daily_love', 'see_you', 'secret', 'wall_post', 'love_moment', 'conflict_resolved'];

const WALL_TAG_CATEGORY = {
  今天喜歡你: 'daily_love',
  我看見你: 'see_you',
  他不知道的事: 'secret',
};

const wallPostCategory = (moodTag) => WALL_TAG_CATEGORY[moodTag] || 'wall_post';

const autoKey = (category, sourceId, ownerId) => `auto:${category}:${sourceId}:${ownerId}`;

async function getRates(userId, client = db) {
  const result = await client.query(
    'SELECT category, amount FROM love_bank_rates WHERE user_id = $1',
    [userId]
  );
  const rates = Object.fromEntries(AUTO_CATEGORIES.map((c) => [c, DEFAULT_RATE]));
  for (const row of result.rows) {
    if (AUTO_CATEGORIES.includes(row.category)) rates[row.category] = row.amount;
  }
  return rates;
}

async function creditPositiveInteraction({ actorId, category, sourceId }) {
  try {
    if (!AUTO_CATEGORIES.includes(category)) return;
    const coupleResult = await db.query(
      `SELECT id, CASE WHEN user1_id = $1 THEN user2_id ELSE user1_id END AS partner_id
         FROM couples WHERE user1_id = $1 OR user2_id = $1 LIMIT 1`,
      [actorId]
    );
    const couple = coupleResult.rows[0];
    if (!couple || !couple.partner_id) return;

    const rates = await getRates(couple.partner_id);
    const amount = rates[category];
    if (!amount) {
      logInfo('love_bank.auto.skipped_zero_rate', { actorId, category, sourceId });
      return;
    }

    const inserted = await db.query(
      `INSERT INTO coin_transactions
         (couple_id, owner_id, created_by, kind, status, amount, transaction_type, earned_from, description, transaction_date, responded_at, idempotency_key)
       VALUES ($1, $2, $3, 'auto', 'confirmed', $4, 'earn', $5, $6, NOW(), NOW(), $7)
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [couple.id, actorId, couple.partner_id, amount, category, category, autoKey(category, sourceId, actorId)]
    );
    logInfo('love_bank.auto.credited', {
      actorId, category, sourceId, amount, deduped: inserted.rows.length === 0,
    });
  } catch (err) {
    logWarn('love_bank.auto.credit_failed', { actorId, category, sourceId, err: err.message });
  }
}

async function creditBothPartners({ coupleId, category, sourceId }) {
  try {
    const result = await db.query('SELECT user1_id, user2_id FROM couples WHERE id = $1', [coupleId]);
    const couple = result.rows[0];
    if (!couple || !couple.user1_id || !couple.user2_id) return;
    await creditPositiveInteraction({ actorId: couple.user1_id, category, sourceId });
    await creditPositiveInteraction({ actorId: couple.user2_id, category, sourceId });
  } catch (err) {
    logWarn('love_bank.auto.credit_both_failed', { coupleId, category, sourceId, err: err.message });
  }
}

async function reverseAutoDeposit({ category = '%', sourceId }) {
  try {
    const result = await db.query(
      `UPDATE coin_transactions
          SET status = 'cancelled', responded_at = NOW()
        WHERE kind = 'auto' AND status = 'confirmed' AND idempotency_key LIKE $1`,
      [`auto:${category}:${sourceId}:%`]
    );
    if (result.rowCount > 0) logInfo('love_bank.auto.reversed', { category, sourceId, rows: result.rowCount });
  } catch (err) {
    logWarn('love_bank.auto.reverse_failed', { category, sourceId, err: err.message });
  }
}

module.exports = {
  AUTO_CATEGORIES,
  DEFAULT_RATE,
  wallPostCategory,
  getRates,
  creditPositiveInteraction,
  creditBothPartners,
  reverseAutoDeposit,
};
