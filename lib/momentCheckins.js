const db = require('../database/db');
const lineService = require('../services/lineService');
const { logInfo, logWarn } = require('./logger');

const CHECKIN_DELAY_MS = 2 * 60 * 60 * 1000;
const RECENT_MOMENT_MS = 24 * 60 * 60 * 1000;
const OPEN_WINDOW_DAYS = 7;

const LIKED = {
  atmosphere: '氣氛',
  foreplay: '前戲',
  pace: '節奏',
  communication: '溝通',
  closeness: '親密感',
  aftercare: '事後擁抱',
  novelty: '新嘗試',
  place: '地點',
};
const TIMING = {
  perfect: '剛剛好，下次也這個時間',
  earlier: '早一點會更好',
  later: '晚一點會更好',
  weekend: '假日比較從容',
};
const NOTE_MAX = 80;

const SWEEP_MIN_INTERVAL_MS = process.env.NODE_ENV === 'test' ? 0 : 60 * 1000;
let lastSweepAt = 0;

async function scheduleCheckin({ momentId, recorderId, coupleId, momentDate }) {
  try {
    if (!coupleId) return null;
    const when = new Date(momentDate).getTime();
    const now = Date.now();
    if (!Number.isFinite(when) || now - when > RECENT_MOMENT_MS || when - now > CHECKIN_DELAY_MS) {
      logInfo('love_moment.checkin.skip_not_recent', { momentId });
      return null;
    }
    const partner = await db.query(
      `SELECT CASE WHEN user1_id = $1 THEN user2_id ELSE user1_id END AS partner_id
         FROM couples WHERE id = $2 AND user2_id IS NOT NULL`,
      [recorderId, coupleId]
    );
    const partnerId = partner.rows[0]?.partner_id;
    if (!partnerId) return null;
    const dueAt = new Date(now + CHECKIN_DELAY_MS).toISOString();
    await db.query(
      `INSERT INTO love_moment_checkins (moment_id, user_id, due_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (moment_id, user_id) DO NOTHING`,
      [momentId, partnerId, dueAt]
    );
    logInfo('love_moment.checkin.scheduled', { momentId, userId: partnerId, dueAt });
    return dueAt;
  } catch (err) {
    logWarn('love_moment.checkin.schedule_failed', { momentId, err: err.message });
    return null;
  }
}

async function sweepDueCheckins({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastSweepAt < SWEEP_MIN_INTERVAL_MS) return 0;
  lastSweepAt = now;
  try {
    const claimed = await db.query(
      `UPDATE love_moment_checkins c
          SET notified_at = NOW(), updated_at = NOW()
        WHERE (c.moment_id, c.user_id) IN (
                SELECT moment_id, user_id FROM love_moment_checkins
                 WHERE due_at <= NOW()
                   AND due_at > NOW() - ($1 || ' days')::interval
                   AND notified_at IS NULL AND answered_at IS NULL AND dismissed_at IS NULL
                 ORDER BY due_at
                 LIMIT 50
              )
      RETURNING c.moment_id, c.user_id`,
      [String(OPEN_WINDOW_DAYS)]
    );
    for (const row of claimed.rows) {
      const title = '剛剛的感覺如何？';
      const content = '花 10 秒說說哪裡最喜歡、這個時間點適不適合，下次可以照著來 💗';
      try {
        await db.query(
          `INSERT INTO notifications (user_id, notification_type, title, content, priority, target_id)
           VALUES ($1, 'love_moment_checkin', $2, $3, 2, $4)`,
          [row.user_id, title, content, String(row.moment_id)]
        );
      } catch (err) {
        logWarn('love_moment.checkin.notify_failed', { momentId: row.moment_id, err: err.message });
      }
      lineService.pushToUserIfLinked(
        db,
        row.user_id,
        `💗 Twogether｜${title}\n${content}\n👉 https://twogether.fun`
      );
    }
    if (claimed.rows.length) logInfo('love_moment.checkin.delivered', { count: claimed.rows.length });
    return claimed.rows.length;
  } catch (err) {
    logWarn('love_moment.checkin.sweep_failed', { err: err.message });
    return 0;
  }
}

async function fetchCheckinsForMoments(momentIds) {
  const map = {};
  if (!momentIds.length) return map;
  try {
    const result = await db.query(
      `SELECT moment_id, user_id, due_at, answered_at, dismissed_at,
              satisfaction, liked, timing, note
         FROM love_moment_checkins
        WHERE moment_id = ANY($1::uuid[])`,
      [momentIds]
    );
    for (const row of result.rows) {
      (map[row.moment_id] = map[row.moment_id] || []).push(row);
    }
  } catch (err) {
    logWarn('love_moment.checkin.fetch_failed', { err: err.message });
  }
  return map;
}

function shapeCheckin(r) {
  if (!r) return null;
  return {
    due_at: r.due_at,
    answered_at: r.answered_at,
    dismissed_at: r.dismissed_at,
    satisfaction: r.satisfaction,
    liked: r.liked || [],
    timing: r.timing,
    note: r.note,
  };
}

function digestCheckins(rows, viewerId) {
  const list = rows || [];
  return {
    my_checkin: shapeCheckin(list.find((r) => r.user_id === viewerId)),
    partner_checkin: shapeCheckin(list.find((r) => r.user_id !== viewerId)),
  };
}

function validateAnswer(body) {
  const satisfaction = Number(body?.satisfaction);
  if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) {
    return { error_code: 'CHECKIN_SATISFACTION_REQUIRED', message: '請先選一個整體感覺（1–5），其他題目都可以略過。' };
  }
  const rawLiked = Array.isArray(body?.liked) ? body.liked : [];
  const liked = [...new Set(rawLiked.map(String))];
  if (liked.some((k) => !LIKED[k])) {
    return { error_code: 'CHECKIN_OPTION_INVALID', message: '有個選項已經不支援了，請重新整理後再選一次。' };
  }
  const timing = body?.timing == null || body.timing === '' ? null : String(body.timing);
  if (timing !== null && !TIMING[timing]) {
    return { error_code: 'CHECKIN_OPTION_INVALID', message: '有個選項已經不支援了，請重新整理後再選一次。' };
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if ([...note].length > NOTE_MAX) {
    return { error_code: 'CHECKIN_NOTE_TOO_LONG', message: `想對 TA 說的話最多 ${NOTE_MAX} 字，更長的心情可以寫進這則記錄的備註。` };
  }
  return { value: { satisfaction, liked, timing, note: note || null } };
}

module.exports = {
  CHECKIN_DELAY_MS,
  LIKED,
  TIMING,
  NOTE_MAX,
  scheduleCheckin,
  sweepDueCheckins,
  fetchCheckinsForMoments,
  digestCheckins,
  validateAnswer,
};
