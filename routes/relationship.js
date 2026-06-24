// 關係之屋 cultivation: the "smart reminder" backend. Computes relationship
// signals on demand (no cron — evaluated when the app loads the dashboard) and,
// when a signal is overdue past its cooldown, drops an in-app notification +
// optional email. Also stores/loads the weekly check-ins.
//
//   GET  /api/relationship/summary   — signals for the dashboard (+ fires due reminders)
//   POST /api/relationship/checkin   — submit a weekly check-in
//   GET  /api/relationship/checkins  — recent check-ins (trend)

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const { logInfo, logWarn } = require('../lib/logger');
const emailService = require('../services/emailService');

const router = express.Router();
router.use(authenticateToken);

const CHECKIN_PERIOD_DAYS = 7;
const REMINDER_COOLDOWN_DAYS = 7;
const INTIMACY_EMAIL_TIER_DAYS = 12; // only nag by email/notification at the high tier
const APPRECIATION_GAP_DAYS = 10;

async function findCouple(userId) {
  const r = await db.query(
    `SELECT id, user1_id, user2_id, created_at FROM couples WHERE user1_id = $1 OR user2_id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

const daysBetween = (then) =>
  then == null ? null : Math.max(0, Math.floor((Date.now() - new Date(then).getTime()) / 86_400_000));

// In-app notification without an event_id (relationship reminders aren't events).
async function notifyReminder(userId, type, title, content) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, notification_type, title, content, priority)
       VALUES ($1, $2, $3, $4, 2)`,
      [userId, type, title, content]
    );
  } catch (err) {
    logWarn('relationship reminder notification failed', { err: err.message, type });
  }
}

// Returns true if a reminder of this kind hasn't been sent within the cooldown,
// and stamps the log so the next call is suppressed. Atomic-ish via upsert.
async function claimReminder(userId, kind) {
  try {
    const r = await db.query(
      `INSERT INTO relationship_reminder_log (user_id, kind, last_sent_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, kind) DO UPDATE SET last_sent_at = NOW()
       WHERE relationship_reminder_log.last_sent_at < NOW() - ($3 || ' days')::interval
       RETURNING user_id`,
      [userId, kind, String(REMINDER_COOLDOWN_DAYS)]
    );
    return r.rows.length > 0;
  } catch (err) {
    logWarn('claimReminder failed', { err: err.message, kind });
    return false;
  }
}

router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await findCouple(userId);
    if (!couple) {
      return res.json({ paired: false });
    }
    const coupleId = couple.id;
    const partnerId = couple.user1_id === userId ? couple.user2_id : couple.user1_id;

    const [intimacy, appreciation, pos, neg, openConf, myCheckin, coupleCheckin, partnerCheckin, partner] = await Promise.all([
      db.query(`SELECT MAX(moment_date) AS last FROM love_moments WHERE couple_id = $1`, [coupleId]),
      db.query(`SELECT MAX(created_at) AS last FROM wall_posts WHERE couple_id = $1`, [coupleId]),
      db.query(
        `SELECT
           (SELECT COUNT(*) FROM wall_posts WHERE couple_id = $1 AND created_at >= NOW() - INTERVAL '14 days')
         + (SELECT COUNT(*) FROM love_moments WHERE couple_id = $1 AND moment_date >= NOW() - INTERVAL '14 days')
         + (SELECT COUNT(*) FROM events WHERE couple_id = $1 AND status = 'resolved' AND resolved_at >= NOW() - INTERVAL '14 days') AS n`,
        [coupleId]
      ),
      db.query(`SELECT COUNT(*) AS n FROM events WHERE couple_id = $1 AND created_at >= NOW() - INTERVAL '14 days'`, [coupleId]),
      db.query(`SELECT COUNT(*) AS n FROM events WHERE couple_id = $1 AND status <> 'resolved' AND is_private = FALSE`, [coupleId]),
      db.query(`SELECT MAX(created_at) AS last FROM relationship_checkins WHERE user_id = $1`, [userId]),
      db.query(`SELECT MAX(created_at) AS last FROM relationship_checkins WHERE couple_id = $1`, [coupleId]),
      partnerId
        ? db.query(`SELECT MAX(created_at) AS last FROM relationship_checkins WHERE user_id = $1`, [partnerId])
        : Promise.resolve({ rows: [{ last: null }] }),
      partnerId ? db.query(`SELECT nickname FROM users WHERE id = $1`, [partnerId]) : Promise.resolve({ rows: [] }),
    ]);

    const daysSinceIntimacy = daysBetween(intimacy.rows[0].last);
    const daysSinceAppreciation = daysBetween(appreciation.rows[0].last);
    const positive14 = Number(pos.rows[0].n) || 0;
    const negative14 = Number(neg.rows[0].n) || 0;
    const myCheckinDays = daysBetween(myCheckin.rows[0].last);
    const partnerCheckinDays = daysBetween(partnerCheckin.rows[0].last);
    const coupleAgeDays = daysBetween(couple.created_at) || 0;
    const isCheckinOverdue = (days) =>
      (days === null || days >= CHECKIN_PERIOD_DAYS) && coupleAgeDays >= CHECKIN_PERIOD_DAYS;
    const checkinOverdue = isCheckinOverdue(myCheckinDays);
    const partnerCheckinOverdue = isCheckinOverdue(partnerCheckinDays);

    const summary = {
      paired: true,
      partnerNickname: partner.rows[0]?.nickname || null,
      daysSinceIntimacy,
      daysSinceAppreciation,
      positive14,
      negative14,
      openConflicts: Number(openConf.rows[0].n) || 0,
      checkin: {
        myLastDays: myCheckinDays,
        coupleLastDays: daysBetween(coupleCheckin.rows[0].last),
        periodDays: CHECKIN_PERIOD_DAYS,
        overdue: checkinOverdue,
      },
    };
    res.json(summary);

    // After responding, evaluate reminders for BOTH partners (deduped per
    // user/kind via the cooldown). Intimacy/appreciation are couple-shared so
    // both are due together; the check-in is per-user, so each is evaluated on
    // their own overdue status — this way one active partner opening the app
    // still nudges a passive partner who hasn't checked in. Emails fire-and-forget.
    const REMINDER_META = {
      checkin_due: { title: '本週的關係檢視', content: '花兩分鐘檢視你們的「信賴」與「奉獻」，照顧關係之屋。' },
      intimacy_gap: { title: '好久沒有親密了', content: `已經 ${daysSinceIntimacy} 天了，主動關心一下另一半吧。` },
      appreciation_gap: { title: '存一筆好感吧', content: '對 TA 說一句欣賞的話，替你們的關係存好感。' },
    };
    const fireRemindersFor = async (targetUserId, checkinDueForTarget) => {
      if (!targetUserId) return;
      const dueKinds = [];
      if (checkinDueForTarget) dueKinds.push('checkin_due');
      if (daysSinceIntimacy !== null && daysSinceIntimacy >= INTIMACY_EMAIL_TIER_DAYS) dueKinds.push('intimacy_gap');
      if (daysSinceAppreciation !== null && daysSinceAppreciation >= APPRECIATION_GAP_DAYS) dueKinds.push('appreciation_gap');
      if (dueKinds.length === 0) return;

      const recipient = await emailService.getUserEmailIfOptedIn(db, targetUserId);
      for (const kind of dueKinds) {
        const claimed = await claimReminder(targetUserId, kind);
        if (!claimed) continue;
        const meta = REMINDER_META[kind];
        await notifyReminder(targetUserId, `relationship_${kind}`, meta.title, meta.content);
        if (recipient) {
          emailService.sendRelationshipReminder({
            recipientEmail: recipient.email,
            recipientName: recipient.nickname,
            kind,
            days: daysSinceIntimacy,
          });
        }
        logInfo('relationship.reminder.sent', { userId: targetUserId, kind, emailed: !!recipient });
      }
    };

    void Promise.all([
      fireRemindersFor(userId, checkinOverdue),
      fireRemindersFor(partnerId, partnerCheckinOverdue),
    ]).catch((err) => logWarn('relationship reminder eval failed', { err: err.message }));
  } catch (error) {
    logDbError('relationship.summary', error, { userId: req.user.id });
    res.status(500).json(errorResponseBody('無法載入關係概況，請稍後再試。', error));
  }
});

router.post(
  '/checkin',
  [
    body('trust').isInt({ min: 1, max: 5 }),
    body('commitment').isInt({ min: 1, max: 5 }),
    body('connection').isInt({ min: 1, max: 5 }),
    body('note').optional().isString().isLength({ max: 1000 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: '請為每個項目評分（1–5）', error_code: 'CHECKIN_INVALID' });
    }
    try {
      const couple = await findCouple(req.user.id);
      if (!couple) return res.status(400).json({ error: '需要先完成伴侶配對才能做關係檢視', error_code: 'NOT_PAIRED' });

      const { trust, commitment, connection } = req.body;
      const note = (req.body.note || '').trim() || null;
      const result = await db.query(
        `INSERT INTO relationship_checkins (couple_id, user_id, trust, commitment, connection, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, trust, commitment, connection, note, created_at`,
        [couple.id, req.user.id, trust, commitment, connection, note]
      );
      // Clear the check-in reminder cooldown stamp so it re-arms naturally.
      await db.query(
        `DELETE FROM relationship_reminder_log WHERE user_id = $1 AND kind = 'checkin_due'`,
        [req.user.id]
      ).catch(() => {});
      logInfo('relationship.checkin.saved', { userId: req.user.id });
      res.status(201).json({ success: true, message: '已記錄本週的關係檢視', checkin: result.rows[0] });
    } catch (error) {
      logDbError('relationship.checkin', error, { userId: req.user.id });
      res.status(500).json(errorResponseBody('儲存關係檢視失敗，請稍後再試。', error));
    }
  }
);

router.get('/checkins', async (req, res) => {
  try {
    const couple = await findCouple(req.user.id);
    if (!couple) return res.json({ checkins: [] });
    const result = await db.query(
      `SELECT rc.id, rc.user_id, rc.trust, rc.commitment, rc.connection, rc.note, rc.created_at,
              u.nickname
         FROM relationship_checkins rc
         JOIN users u ON u.id = rc.user_id
        WHERE rc.couple_id = $1
        ORDER BY rc.created_at DESC
        LIMIT 24`,
      [couple.id]
    );
    res.json({
      checkins: result.rows.map((r) => ({
        id: r.id,
        nickname: r.nickname,
        isMine: r.user_id === req.user.id,
        trust: r.trust,
        commitment: r.commitment,
        connection: r.connection,
        note: r.note,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    logDbError('relationship.checkins', error, { userId: req.user.id });
    res.status(500).json(errorResponseBody('無法載入關係檢視紀錄，請稍後再試。', error));
  }
});

module.exports = router;
