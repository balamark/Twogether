const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logInfo, logWarn, logError } = require('../lib/logger');
const lineService = require('../services/lineService');
const { notifyPartnerAction } = require('../services/notificationService');

// 回頭接住 Repair attempts (migration 117).
//
// After a fight most couples just carry on; the feeling is never handled and
// slowly hardens into 「他根本不重視我的感受」. Gottman's repair attempt is the
// small move afterwards that pulls the relationship back — and it still counts
// an hour or a day later, once both have calmed down. This router is that
// move, kept deliberately lighter than 說開一件事 (no thread, no AI, no quota):
//
//   GET    /api/repair                      — my reminders + notes both ways + 30-day stats
//   POST   /api/repair/reminders            — 冷靜後提醒我 (remind_at 10 min – 48 h out)
//   DELETE /api/repair/reminders/:id        — cancel / dismiss my reminder
//   POST   /api/repair                      — send a note to my partner
//   POST   /api/repair/:id/respond          — recipient answers once
//
// Privacy: a reminder is only ever visible to its owner; a note only to its
// sender and recipient. Every write is keyed by the token's user id.

const router = express.Router();
router.use(authenticateToken);

// Keys, not labels — the frontend owns the copy (src/components/repair/).
const KINDS = new Set(['validate', 'thanks', 'own_part', 'care', 'pause', 'light']);
const RESPONSES = new Set(['received', 'talk', 'need_time']);
const MAX_TEXT = 500;
const MAX_NOTE = 300;
const DAILY_SEND_LIMIT = 10;
const MAX_ACTIVE_REMINDERS = 3;
const MIN_REMIND_MS = 10 * 60 * 1000;
const MAX_REMIND_MS = 48 * 3600 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findCouple(userId) {
  const r = await db.query(
    `SELECT id, CASE WHEN user1_id = $1 THEN user2_id ELSE user1_id END AS partner_id
       FROM couples WHERE user1_id = $1 OR user2_id = $1 LIMIT 1`,
    [userId]
  );
  const row = r.rows[0];
  if (!row) return { coupleId: null, partnerId: null };
  return { coupleId: row.id, partnerId: row.partner_id || null };
}

function shape(row, userId) {
  return {
    id: row.id,
    status: row.status,
    direction: row.sender_id === userId ? 'outgoing' : 'incoming',
    kind: row.kind,
    text: row.text,
    remind_at: row.remind_at,
    reminded_at: row.reminded_at,
    sent_at: row.sent_at,
    response: row.response,
    response_note: row.response_note,
    responded_at: row.responded_at,
    created_at: row.created_at,
  };
}

async function loadOverview(userId) {
  const [rows, stats] = await Promise.all([
    db.query(
      `SELECT * FROM repair_attempts
        WHERE (sender_id = $1 AND (status = 'scheduled' OR sent_at >= NOW() - INTERVAL '30 days'))
           OR (recipient_id = $1 AND status = 'sent' AND sent_at >= NOW() - INTERVAL '30 days')
        ORDER BY COALESCE(sent_at, remind_at, created_at) DESC
        LIMIT 30`,
      [userId]
    ),
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE sender_id = $1)::int AS sent,
         COUNT(*) FILTER (WHERE recipient_id = $1)::int AS received,
         COUNT(*) FILTER (WHERE response = 'received')::int AS caught
         FROM repair_attempts
        WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '30 days'
          AND (sender_id = $1 OR recipient_id = $1)`,
      [userId]
    ),
  ]);
  const all = rows.rows.map((r) => shape(r, userId));
  return {
    reminders: all.filter((r) => r.status === 'scheduled'),
    notes: all.filter((r) => r.status === 'sent'),
    stats: stats.rows[0] || { sent: 0, received: 0, caught: 0 },
  };
}

// ---------------------------------------------------------------------------
// Lazy reminder sweep — there is no cron in this app
// ---------------------------------------------------------------------------
// Rides GET /api/repair (首頁) and the notification unread-count poll every
// open app makes, throttled per process. Claiming with UPDATE … RETURNING
// means two instances can't notify the same reminder twice.
const SWEEP_MIN_INTERVAL_MS = process.env.NODE_ENV === 'test' ? 0 : 60 * 1000;
let lastSweepAt = 0;

async function sweepDueRepairReminders({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastSweepAt < SWEEP_MIN_INTERVAL_MS) return 0;
  lastSweepAt = now;
  try {
    const claimed = await db.query(
      `UPDATE repair_attempts SET reminded_at = NOW(), updated_at = NOW()
        WHERE id IN (
          SELECT id FROM repair_attempts
           WHERE status = 'scheduled' AND reminded_at IS NULL AND remind_at <= NOW()
           ORDER BY remind_at
           LIMIT 50
        )
        RETURNING id, sender_id`
    );
    for (const row of claimed.rows) {
      const title = '🕊️ 冷靜一點了嗎？回頭接住對方一句';
      const content = '吵完架之後，事情過去了，情緒不一定。現在說一句「你那時會生氣，其實是有原因的」，就是修復的開始。';
      try {
        await db.query(
          `INSERT INTO notifications (user_id, notification_type, title, content, priority, target_id)
           VALUES ($1, 'repair_reminder', $2, $3, 2, $4)`,
          [row.sender_id, title, content, String(row.id)]
        );
      } catch (err) {
        logWarn('repair.reminder_notification_failed', { err: err.message, repairId: row.id });
      }
      lineService.pushToUserIfLinked(db, row.sender_id, `${title}\n${content}\n👉 https://twogether.fun`);
    }
    if (claimed.rows.length > 0) logInfo('repair.reminders_fired', { count: claimed.rows.length });
    return claimed.rows.length;
  } catch (err) {
    logWarn('sweepDueRepairReminders failed', { err: err.message });
    return 0;
  }
}

// GET /api/repair
router.get('/', async (req, res) => {
  const userId = req.user.id;
  try {
    await sweepDueRepairReminders();
    const { partnerId } = await findCouple(userId);
    const overview = await loadOverview(userId);
    res.json({ success: true, paired: !!partnerId, ...overview });
  } catch (error) {
    logError('repair.load_failed', { userId, err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error_code: 'REPAIR_LOAD_FAILED',
      message: '暫時讀不到回頭接住的紀錄，請稍後重新整理再試',
    });
  }
});

// POST /api/repair/reminders { remind_at: ISO }
router.post('/reminders', async (req, res) => {
  const userId = req.user.id;
  const remindAt = new Date(req.body?.remind_at);
  const delta = remindAt.getTime() - Date.now();
  if (Number.isNaN(remindAt.getTime()) || delta < MIN_REMIND_MS - 60 * 1000 || delta > MAX_REMIND_MS) {
    logWarn('repair.reminder_time_invalid', { userId, remind_at: req.body?.remind_at });
    return res.status(400).json({
      success: false,
      error_code: 'REPAIR_REMIND_TIME_INVALID',
      message: '提醒時間要在 10 分鐘到 48 小時之內，請重新選一個時間',
    });
  }
  try {
    const active = await db.query(
      `SELECT COUNT(*)::int AS n FROM repair_attempts
        WHERE sender_id = $1 AND status = 'scheduled' AND reminded_at IS NULL`,
      [userId]
    );
    if (active.rows[0].n >= MAX_ACTIVE_REMINDERS) {
      logInfo('repair.reminder_limit', { userId });
      return res.status(409).json({
        success: false,
        error_code: 'REPAIR_REMINDER_LIMIT',
        message: '你已經設了 3 個還沒到的提醒。先取消一個，或現在就寫一句給對方吧',
      });
    }
    const { coupleId, partnerId } = await findCouple(userId);
    const r = await db.query(
      `INSERT INTO repair_attempts (couple_id, sender_id, recipient_id, status, remind_at)
       VALUES ($1, $2, $3, 'scheduled', $4) RETURNING *`,
      [coupleId, userId, partnerId, remindAt.toISOString()]
    );
    logInfo('repair.reminder_set', { userId, minutes: Math.round(delta / 60000), paired: !!partnerId });
    res.status(201).json({ success: true, reminder: shape(r.rows[0], userId) });
  } catch (error) {
    logError('repair.reminder_failed', { userId, err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error_code: 'REPAIR_REMINDER_FAILED',
      message: '提醒沒有設定成功，請稍後再按一次',
    });
  }
});

// DELETE /api/repair/reminders/:id — owner only, scheduled rows only.
router.delete('/reminders/:id', async (req, res) => {
  const userId = req.user.id;
  if (!UUID.test(req.params.id)) {
    return res.status(404).json({ success: false, error_code: 'REPAIR_NOT_FOUND', message: '找不到這個提醒，它可能已經取消了' });
  }
  try {
    const r = await db.query(
      `DELETE FROM repair_attempts WHERE id = $1 AND sender_id = $2 AND status = 'scheduled' RETURNING id`,
      [req.params.id, userId]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error_code: 'REPAIR_NOT_FOUND', message: '找不到這個提醒，它可能已經取消了' });
    }
    logInfo('repair.reminder_cancelled', { userId });
    res.json({ success: true });
  } catch (error) {
    logError('repair.reminder_cancel_failed', { userId, err: error.message });
    res.status(500).json({ success: false, error_code: 'REPAIR_CANCEL_FAILED', message: '提醒沒有取消成功，請稍後再試一次' });
  }
});

// POST /api/repair { kind, text, reminder_id? }
router.post('/', async (req, res) => {
  const userId = req.user.id;
  const kind = req.body?.kind;
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const reminderId = req.body?.reminder_id;

  if (!KINDS.has(kind)) {
    return res.status(400).json({ success: false, error_code: 'REPAIR_KIND_INVALID', message: '請先選一種想說的方式，再送出' });
  }
  if (!text) {
    return res.status(400).json({ success: false, error_code: 'REPAIR_TEXT_EMPTY', message: '先寫一句想對 TA 說的話，再送出' });
  }
  if (text.length > MAX_TEXT) {
    return res.status(400).json({ success: false, error_code: 'REPAIR_TEXT_TOO_LONG', message: '修復小紙條最多 500 字。短短一句就夠了，請精簡一些再送出' });
  }

  try {
    const { coupleId, partnerId } = await findCouple(userId);
    if (!partnerId) {
      logInfo('repair.send_unpaired', { userId });
      return res.status(403).json({
        success: false,
        error_code: 'REPAIR_NOT_PAIRED',
        message: '還沒和另一半配對，小紙條沒有地方送。你可以先複製這句話用 LINE 傳給 TA，或邀請 TA 一起加入 Twogether',
      });
    }
    const today = await db.query(
      `SELECT COUNT(*)::int AS n FROM repair_attempts
        WHERE sender_id = $1 AND status = 'sent' AND sent_at >= NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    if (today.rows[0].n >= DAILY_SEND_LIMIT) {
      logInfo('repair.daily_limit', { userId });
      return res.status(429).json({
        success: false,
        error_code: 'REPAIR_DAILY_LIMIT',
        message: '24 小時內最多送出 10 張小紙條。給 TA 一點時間讀完、消化一下；想說的話更多，可以到「說開一件事」慢慢談',
      });
    }

    let row = null;
    if (reminderId && UUID.test(reminderId)) {
      const r = await db.query(
        `UPDATE repair_attempts
            SET status = 'sent', kind = $3, text = $4, sent_at = NOW(), couple_id = $5,
                recipient_id = $6, updated_at = NOW()
          WHERE id = $1 AND sender_id = $2 AND status = 'scheduled'
          RETURNING *`,
        [reminderId, userId, kind, text, coupleId, partnerId]
      );
      row = r.rows[0] || null;
    }
    if (!row) {
      const r = await db.query(
        `INSERT INTO repair_attempts (couple_id, sender_id, recipient_id, status, kind, text, sent_at)
         VALUES ($1, $2, $3, 'sent', $4, $5, NOW()) RETURNING *`,
        [coupleId, userId, partnerId, kind, text]
      );
      row = r.rows[0];
    }

    notifyPartnerAction({ actorId: userId, type: 'repair_sent', content: text, priority: 2, targetId: row.id });
    logInfo('repair.sent', {
      userId,
      kind,
      length: text.length,
      fromReminder: !!(reminderId && row.remind_at),
      hoursAfterReminderSet: row.remind_at ? Math.round((Date.now() - new Date(row.created_at).getTime()) / 3600000) : null,
    });
    res.status(201).json({ success: true, note: shape(row, userId) });
  } catch (error) {
    logError('repair.send_failed', { userId, err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error_code: 'REPAIR_SEND_FAILED',
      message: '小紙條沒有送出去，你寫的內容還在，請稍後再按一次送出',
    });
  }
});

// POST /api/repair/:id/respond { response, note? } — recipient, once.
router.post('/:id/respond', async (req, res) => {
  const userId = req.user.id;
  const response = req.body?.response;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (!RESPONSES.has(response)) {
    return res.status(400).json({ success: false, error_code: 'REPAIR_RESPONSE_INVALID', message: '請選一個回應，再送出' });
  }
  if (note.length > MAX_NOTE) {
    return res.status(400).json({ success: false, error_code: 'REPAIR_NOTE_TOO_LONG', message: '回應最多 300 字，請精簡一些再送出' });
  }
  if (!UUID.test(req.params.id)) {
    return res.status(404).json({ success: false, error_code: 'REPAIR_NOT_FOUND', message: '找不到這張小紙條，它可能已經被移除了' });
  }
  try {
    const r = await db.query(
      `UPDATE repair_attempts
          SET response = $3, response_note = $4, responded_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND recipient_id = $2 AND status = 'sent' AND response IS NULL
        RETURNING *`,
      [req.params.id, userId, response, note || null]
    );
    if (r.rows.length === 0) {
      const existing = await db.query(
        `SELECT recipient_id, response FROM repair_attempts WHERE id = $1 AND status = 'sent'`,
        [req.params.id]
      );
      const ex = existing.rows[0];
      if (ex && ex.recipient_id === userId && ex.response) {
        return res.status(409).json({
          success: false,
          error_code: 'REPAIR_ALREADY_RESPONDED',
          message: '你已經回應過這張小紙條了。想多說一些，可以到「說開一件事」慢慢聊',
        });
      }
      return res.status(404).json({ success: false, error_code: 'REPAIR_NOT_FOUND', message: '找不到這張小紙條，它可能已經被移除了' });
    }
    const row = r.rows[0];
    const type = `repair_response_${response}`;
    notifyPartnerAction({ actorId: userId, type, content: note || null, targetId: row.id });
    logInfo('repair.responded', {
      userId,
      response,
      withNote: !!note,
      minutesToRespond: Math.round((Date.now() - new Date(row.sent_at).getTime()) / 60000),
    });
    res.json({ success: true, note: shape(row, userId) });
  } catch (error) {
    logError('repair.respond_failed', { userId, err: error.message, stack: error.stack });
    res.status(500).json({ success: false, error_code: 'REPAIR_RESPOND_FAILED', message: '回應沒有送出去，請稍後再按一次' });
  }
});

module.exports = router;
module.exports.sweepDueRepairReminders = sweepDueRepairReminders;
