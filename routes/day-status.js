const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logInfo, logWarn, logError } = require('../lib/logger');

// 每日狀態 — one-tap mood + intimacy intention per person per day (migration 104).
//
// Privacy rules, enforced here rather than trusted to the client:
//  - every write is keyed by the token's user id, so a partner can never fill
//    in or edit someone else's status;
//  - a partner's row is returned only while its owner has sharing_enabled on;
//  - clearing both fields deletes the row: "not recorded" is never stored as
//    a value that could read as "doesn't want to".

const router = express.Router();
router.use(authenticateToken);

// Keys, not labels — the frontend owns the copy.
const MOODS = new Set(['great', 'good', 'okay', 'low', 'stressed']);
const INTENTIONS = new Set([
  'want_intimacy', 'start_with_cuddles', 'prefer_rest', 'not_sure', 'prefer_not_say',
]);

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;

function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidYmd(s) {
  if (typeof s !== 'string' || !YMD.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Latest calendar date anywhere on Earth right now (UTC+14). A status is about
// how someone feels on a day that has started for them; anything later is a
// future day and can't be recorded yet.
function latestRecordableYmd() {
  return new Date(Date.now() + 14 * 3600 * 1000).toISOString().slice(0, 10);
}

function shapeRow(row) {
  return {
    date: toIsoDate(row.status_date),
    mood: row.mood,
    intimacy_intention: row.intimacy_intention,
    sharing_enabled: row.sharing_enabled === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findPartnerId(userId) {
  const r = await db.query(
    'SELECT user1_id, user2_id FROM couples WHERE user1_id = $1 OR user2_id = $1 LIMIT 1',
    [userId]
  );
  if (r.rows.length === 0) return null;
  const { user1_id, user2_id } = r.rows[0];
  const partner = user1_id === userId ? user2_id : user1_id;
  return partner || null;
}

// GET /api/day-status?from=YYYY-MM-DD&to=YYYY-MM-DD
// → { mine: [...], partner: [...] }  (partner = shared rows only)
router.get('/', async (req, res) => {
  const { from, to } = req.query;
  if (!isValidYmd(from) || !isValidYmd(to) || from > to) {
    return res.status(400).json({
      success: false,
      error_code: 'DAY_STATUS_RANGE_INVALID',
      message: '日期區間格式錯誤，請重新整理頁面後再試',
    });
  }
  const span = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000;
  if (span > MAX_RANGE_DAYS) {
    return res.status(400).json({
      success: false,
      error_code: 'DAY_STATUS_RANGE_TOO_LONG',
      message: '一次最多查詢 400 天的每日狀態，請縮小日期範圍',
    });
  }

  try {
    const userId = req.user.id;
    const partnerId = await findPartnerId(userId);
    const result = await db.query(
      `SELECT user_id, status_date, mood, intimacy_intention, sharing_enabled, created_at, updated_at
         FROM day_statuses
        WHERE status_date BETWEEN $1 AND $2
          AND (user_id = $3 OR (user_id = $4 AND sharing_enabled = TRUE))
        ORDER BY status_date`,
      [from, to, userId, partnerId]
    );
    const mine = [];
    const partner = [];
    for (const row of result.rows) {
      (row.user_id === userId ? mine : partner).push(shapeRow(row));
    }
    res.json({ success: true, mine, partner });
  } catch (error) {
    logError('Get day statuses failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error_code: 'DAY_STATUS_LOAD_FAILED',
      message: '無法載入每日狀態，請稍後再試',
    });
  }
});

// PUT /api/day-status/:date — upsert the caller's own status for that day.
// Body fields are all optional; a field that is present overwrites (null
// clears it), a field that is absent is left as is.
router.put('/:date', async (req, res) => {
  const date = req.params.date;
  const userId = req.user.id;
  if (!isValidYmd(date)) {
    return res.status(400).json({
      success: false,
      error_code: 'DAY_STATUS_DATE_INVALID',
      message: '日期格式錯誤，請重新選擇日期',
    });
  }
  if (date > latestRecordableYmd()) {
    logWarn('Day status future date rejected', { userId, date });
    return res.status(400).json({
      success: false,
      error_code: 'DAY_STATUS_FUTURE_DATE',
      message: '這一天還沒到，等當天再記錄你的狀態吧',
    });
  }

  const body = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (has('mood') && body.mood !== null && !MOODS.has(body.mood)) {
    return res.status(400).json({
      success: false,
      error_code: 'DAY_STATUS_MOOD_INVALID',
      message: '心情選項無效，請重新選擇',
    });
  }
  if (has('intimacy_intention') && body.intimacy_intention !== null && !INTENTIONS.has(body.intimacy_intention)) {
    return res.status(400).json({
      success: false,
      error_code: 'DAY_STATUS_INTENTION_INVALID',
      message: '親密意願選項無效，請重新選擇',
    });
  }
  if (has('sharing_enabled') && typeof body.sharing_enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      error_code: 'DAY_STATUS_SHARING_INVALID',
      message: '分享設定格式錯誤，請重新切換一次',
    });
  }
  if (!has('mood') && !has('intimacy_intention') && !has('sharing_enabled')) {
    return res.status(400).json({
      success: false,
      error_code: 'DAY_STATUS_EMPTY_UPDATE',
      message: '沒有要更新的內容，請選擇心情或親密意願',
    });
  }

  try {
    const existing = await db.query(
      'SELECT mood, intimacy_intention, sharing_enabled FROM day_statuses WHERE user_id = $1 AND status_date = $2',
      [userId, date]
    );
    const prev = existing.rows[0] || { mood: null, intimacy_intention: null, sharing_enabled: false };
    const next = {
      mood: has('mood') ? body.mood : prev.mood,
      intimacy_intention: has('intimacy_intention') ? body.intimacy_intention : prev.intimacy_intention,
      sharing_enabled: has('sharing_enabled') ? body.sharing_enabled : prev.sharing_enabled,
    };

    if (next.mood === null && next.intimacy_intention === null) {
      await db.query('DELETE FROM day_statuses WHERE user_id = $1 AND status_date = $2', [userId, date]);
      logInfo('Day status cleared', { userId, date });
      return res.json({ success: true, message: '已清除這天的狀態', day_status: null });
    }

    const result = await db.query(
      `INSERT INTO day_statuses (user_id, status_date, mood, intimacy_intention, sharing_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, status_date) DO UPDATE
         SET mood = EXCLUDED.mood,
             intimacy_intention = EXCLUDED.intimacy_intention,
             sharing_enabled = EXCLUDED.sharing_enabled,
             updated_at = NOW()
       RETURNING status_date, mood, intimacy_intention, sharing_enabled, created_at, updated_at`,
      [userId, date, next.mood, next.intimacy_intention, next.sharing_enabled]
    );

    logInfo('Day status saved', {
      userId,
      date,
      created: existing.rows.length === 0,
      hasMood: next.mood !== null,
      hasIntention: next.intimacy_intention !== null,
      shared: next.sharing_enabled,
    });
    res.json({ success: true, message: '已記錄這天的狀態', day_status: shapeRow(result.rows[0]) });
  } catch (error) {
    logError('Save day status failed', { err: error.message, stack: error.stack, userId, date });
    res.status(500).json({
      success: false,
      error_code: 'DAY_STATUS_SAVE_FAILED',
      message: '無法儲存每日狀態，請稍後再試',
    });
  }
});

// DELETE /api/day-status/:date — clear the caller's own status for that day.
router.delete('/:date', async (req, res) => {
  const date = req.params.date;
  const userId = req.user.id;
  if (!isValidYmd(date)) {
    return res.status(400).json({
      success: false,
      error_code: 'DAY_STATUS_DATE_INVALID',
      message: '日期格式錯誤，請重新選擇日期',
    });
  }
  try {
    await db.query('DELETE FROM day_statuses WHERE user_id = $1 AND status_date = $2', [userId, date]);
    logInfo('Day status cleared', { userId, date });
    res.json({ success: true, message: '已清除這天的狀態' });
  } catch (error) {
    logError('Clear day status failed', { err: error.message, stack: error.stack, userId, date });
    res.status(500).json({
      success: false,
      error_code: 'DAY_STATUS_CLEAR_FAILED',
      message: '無法清除每日狀態，請稍後再試',
    });
  }
});

module.exports = router;
module.exports._internal = { MOODS, INTENTIONS, isValidYmd };
