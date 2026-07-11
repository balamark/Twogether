const express = require('express');
const crypto = require('crypto');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const llmService = require('../services/llmService');
const emailService = require('../services/emailService');
const { checkLimit } = require('../lib/entitlements');
const { resolveCompanion } = require('../lib/aiCompanions');
const { cardMeta, applyVerdict, scoreSession } = require('../lib/therapyCards');
const { logInfo, logWarn, logError } = require('../lib/logger');
const {
  countTodayAiUsage,
  resolveAiLimit,
  recordAiUsage,
} = require('../lib/aiUsage');

const router = express.Router();

router.use(authenticateToken);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TAG_VOCAB = ['語氣', '誤會', '家務', '行程', '金錢', '育兒', '家人'];
const VERSION_KEYS = ['neutral', 'firm', 'warm'];

// Daily cap on AI (LLM) calls is now tier-aware and lives in lib/entitlements.js
// (free vs premium). Both the icebreaker and the reply-rewrite preview count
// against the same daily budget since both hit the paid LLM.

// Diagnostic: log the assembled user prompt for the first N reply rewrites
// each process so we can verify role-tag wiring in prod. Set to 0 to silence.
// Counter resets on every deploy — intentional, we want fresh visibility.
let REPLY_PROMPT_LOG_REMAINING = Number(
  process.env.REPLY_REWRITE_LOG_PROMPT_N || 20
);

async function ensureNotificationsTable() {
  // Mirrors the lazy creation in routes/intimacy-requests.js but adds an
  // optional event_id column so we can wire event notifications to a row.
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        intimacy_request_id UUID REFERENCES intimacy_requests(id) ON DELETE CASCADE,
        related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        priority INTEGER NOT NULL DEFAULT 1
      );
    `);
    await db.query(`
      ALTER TABLE notifications
        ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE
    `);
  } catch (err) {
    logWarn('ensureNotificationsTable failed', { err: err.message });
  }
}

async function notify(userId, type, title, content, eventId, relatedUserId, priority = 2, messageContent = null, aiName = null) {
  try {
    await ensureNotificationsTable();
    await db.query(
      `INSERT INTO notifications (user_id, notification_type, title, content, event_id, related_user_id, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, type, title, content, eventId, relatedUserId || null, priority]
    );
  } catch (err) {
    logWarn('Event notification insert failed', { type, err: err.message });
  }

  // Fire-and-forget email mirroring the in-app notification. Skips silently
  // when the recipient is opted out, unconfigured, or unreachable.
  try {
    const recipient = await emailService.getUserEmailIfOptedIn(db, userId);
    if (!recipient) return;
    let senderName = null;
    if (relatedUserId) {
      const r = await db.query(`SELECT nickname FROM users WHERE id = $1`, [relatedUserId]);
      senderName = r.rows[0]?.nickname || null;
    }
    await emailService.sendEventNotification({
      senderName,
      recipientEmail: recipient.email,
      eventTitle: content,
      type,
      messageContent,
      aiName,
    });
  } catch (err) {
    logWarn('Event notification email failed', { type, err: err.message });
  }
}

// The inviting user's chosen AI companion persona (falls back to Luma).
async function getUserCompanion(userId) {
  try {
    const r = await db.query(`SELECT selected_therapist FROM users WHERE id = $1`, [userId]);
    return resolveCompanion(r.rows[0]?.selected_therapist);
  } catch (err) {
    logWarn('getUserCompanion failed; using default', { err: err.message });
    return resolveCompanion(null);
  }
}

// Both partners' genders so AI prompts use the right pronouns (他/她) instead
// of guessing. Either may be null when unset or unpaired.
async function getCoupleGenders(userId) {
  try {
    const r = await db.query(
      `SELECT u.gender AS user_gender, p.gender AS partner_gender
         FROM users u
         LEFT JOIN couples c ON (c.user1_id = u.id OR c.user2_id = u.id) AND c.user2_id IS NOT NULL
         LEFT JOIN users p ON p.id = CASE WHEN c.user1_id = u.id THEN c.user2_id ELSE c.user1_id END
        WHERE u.id = $1`,
      [userId]
    );
    return {
      userGender: r.rows[0]?.user_gender || null,
      partnerGender: r.rows[0]?.partner_gender || null,
    };
  } catch (err) {
    logWarn('getCoupleGenders failed', { err: err.message });
    return { userGender: null, partnerGender: null };
  }
}

// --- Per-event AI preview cache -------------------------------------------
// Same input (thread state + persona) → same stored response, no LLM re-call
// and no hit against the user's daily AI budget. New messages change the hash.

function aiCacheHash(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

async function getAiCache(eventId, userId, kind, inputHash) {
  try {
    const r = await db.query(
      `SELECT response FROM event_ai_cache
        WHERE event_id = $1 AND user_id = $2 AND kind = $3 AND input_hash = $4`,
      [eventId, userId, kind, inputHash]
    );
    return r.rows[0]?.response || null;
  } catch (err) {
    logWarn('getAiCache failed', { kind, err: err.message });
    return null;
  }
}

async function saveAiCache(eventId, userId, kind, inputHash, response) {
  try {
    await db.query(
      `INSERT INTO event_ai_cache (event_id, user_id, kind, input_hash, response)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id, user_id, kind, input_hash) DO UPDATE SET response = EXCLUDED.response`,
      [eventId, userId, kind, inputHash, JSON.stringify(response)]
    );
  } catch (err) {
    logWarn('saveAiCache failed', { kind, err: err.message });
  }
}

async function getCoupleForUser(userId) {
  const result = await db.query(
    `SELECT c.id AS couple_id,
            CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END AS partner_id
     FROM couples c
     WHERE (c.user1_id = $1 OR c.user2_id = $1) AND c.user2_id IS NOT NULL`,
    [userId]
  );
  return result.rows[0] || null;
}

async function assertEventAccess(eventId, userId) {
  const result = await db.query(
    `SELECT e.*,
            CASE WHEN c.user1_id = $2 THEN c.user2_id ELSE c.user1_id END AS partner_id
     FROM events e
     JOIN couples c ON c.id = e.couple_id
     WHERE e.id = $1
       AND (c.user1_id = $2 OR c.user2_id = $2)`,
    [eventId, userId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { event: row, coupleId: row.couple_id, partnerId: row.partner_id };
}

function serializeEvent(row, extras = {}) {
  return {
    id: row.id,
    couple_id: row.couple_id,
    created_by: row.created_by,
    title: row.title,
    summary: row.summary,
    emotions: row.emotions || [],
    tags: row.tags || [],
    toxicity_flags: row.toxicity_flags || [],
    versions: {
      neutral: row.ai_neutral,
      firm: row.ai_firm,
      warm: row.ai_warm,
    },
    selected_version: row.selected_version,
    is_private: row.is_private,
    content_edited_at: row.content_edited_at || null,
    public_status: row.public_status || 'private',
    public_title: row.public_title || null,
    status: row.status,
    translation_enabled: row.translation_enabled === true,
    therapy_note: row.therapy_note || null,
    resolve_requested_by: row.resolve_requested_by,
    resolve_requested_at: row.resolve_requested_at,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...extras,
  };
}

function serializeMessage(row) {
  return {
    id: row.id,
    event_id: row.event_id,
    sender_id: row.sender_id,
    content: row.content,
    is_ai: row.is_ai === true,
    ai_therapist: row.ai_therapist || null,
    facilitation: row.facilitation || null,
    created_at: row.created_at,
    read_at: row.read_at,
    edited_at: row.edited_at || null,
  };
}

function sendValidationError(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: '驗證失敗', errors: errors.array() });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Preview only — no DB write into events. The raw text IS persisted into
// event_ai_usage for offline debugging / cost auditing, but never returned
// in any API response and never shown in UI.
router.post(
  '/icebreaker',
  [body('rawText').isString().isLength({ min: 1, max: 4000 }).withMessage('原始文字需在 1–4000 字之間')],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    const userId = req.user.id;
    const rawText = req.body.rawText;
    // Backend-only audit log of the user's original words. Single tagged
    // line so it's easy to grep in Cloud Logging.
    logInfo('events.icebreaker.input', { userId, len: rawText.length, raw: rawText });

    try {
      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('events.icebreaker.limit', { userId, used: usedToday, limit, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      const genders = await getCoupleGenders(userId);
      const preview = await llmService.generateIcebreaker(rawText, genders);
      const meta = preview._meta;
      delete preview._meta;

      logInfo('events.icebreaker.cost', {
        userId,
        provider: meta?.provider,
        model: meta?.model,
        costUsd: meta?.costUsd,
        durationMs: meta?.durationMs,
        usedToday: usedToday + 1,
        limit,
        tier,
      });

      await recordAiUsage(userId, 'icebreaker', rawText, meta);
      res.json({ success: true, preview });
    } catch (err) {
      logError('Icebreaker preview failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: 'AI 解析失敗，請稍後再試' });
    }
  }
);

// Create event (with optional first message seeded from selected version)
router.post(
  '/',
  [
    body('title').isString().isLength({ min: 1, max: 120 }),
    body('summary').isString().isLength({ min: 1, max: 1000 }),
    body('ai_neutral').isString().isLength({ min: 1 }),
    body('ai_firm').isString().isLength({ min: 1 }),
    body('ai_warm').isString().isLength({ min: 1 }),
    body('selected_version').optional({ nullable: true }).isIn(VERSION_KEYS),
    body('opening_message')
      .optional({ nullable: true })
      .isString()
      .isLength({ min: 1, max: 2000 })
      .withMessage('開場訊息需在 1–2000 字之間'),
    body('emotions').optional().isArray(),
    body('tags').optional().isArray(),
    body('toxicity_flags').optional().isArray(),
    body('is_private').optional().isBoolean(),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const couple = await getCoupleForUser(userId);
      if (!couple) {
        return res.status(404).json({
          success: false,
          message: '您還沒有完整的情侶關係',
          error_code: 'NO_COMPLETE_COUPLE',
        });
      }

      const {
        title,
        summary,
        ai_neutral,
        ai_firm,
        ai_warm,
        selected_version = null,
        opening_message = null,
        emotions = [],
        tags = [],
        toxicity_flags = [],
        is_private = false,
      } = req.body;

      const eventId = uuidv4();

      const insertResult = await db.query(
        `INSERT INTO events (
           id, couple_id, created_by, title, summary,
           emotions, tags, toxicity_flags,
           ai_neutral, ai_firm, ai_warm,
           selected_version, is_private, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'open')
         RETURNING *`,
        [
          eventId,
          couple.couple_id,
          userId,
          title,
          summary,
          emotions,
          tags,
          toxicity_flags,
          ai_neutral,
          ai_firm,
          ai_warm,
          selected_version,
          Boolean(is_private),
        ]
      );

      const event = insertResult.rows[0];

      // Seed first message only when the event is shared and a version was picked.
      let firstMessage = null;
      if (!event.is_private && selected_version) {
        const versionMap = { neutral: ai_neutral, firm: ai_firm, warm: ai_warm };
        // The user may have edited the selected version before sending; the
        // ai_* columns keep the untouched AI originals as provenance.
        const openerText =
          typeof opening_message === 'string' && opening_message.trim()
            ? opening_message.trim()
            : versionMap[selected_version];
        const msgResult = await db.query(
          `INSERT INTO event_messages (event_id, sender_id, content)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [eventId, userId, openerText]
        );
        firstMessage = msgResult.rows[0];
        logInfo('events.create.opening_edited', {
          userId,
          eventId,
          edited: openerText !== versionMap[selected_version],
        });
      }

      // Notify partner only for shared events.
      if (!event.is_private) {
        await notify(
          couple.partner_id,
          'event_created',
          '伴侶開啟了一個事件',
          event.title,
          eventId,
          userId,
          2,
          firstMessage ? firstMessage.content : null
        );
      }

      res.status(201).json({
        success: true,
        event: serializeEvent(event, {
          messages: firstMessage ? [serializeMessage(firstMessage)] : [],
          unread_count: 0,
        }),
      });
    } catch (err) {
      logError('Create event failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '建立事件失敗' });
    }
  }
);

// Analytics — placed before /:id to avoid UUID validator catching the path
router.get('/analytics', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await getCoupleForUser(userId);
    if (!couple) {
      return res.json({
        success: true,
        analytics: {
          counts: { last7: 0, last30: 0 },
          resolution_rate: 0,
          avg_resolution_hours: null,
          tag_distribution: [],
          emotion_distribution: [],
          daily_trend: [],
          hotspot_hours: [],
        },
      });
    }
    const coupleId = couple.couple_id;

    const countsResult = await db.query(
      `SELECT
         SUM(CASE WHEN created_at >= NOW() - INTERVAL '7 days'  THEN 1 ELSE 0 END) AS last7,
         SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) AS last30,
         SUM(CASE WHEN status = 'resolved' AND created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) AS resolved30,
         SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) AS total30
       FROM events WHERE couple_id = $1`,
      [coupleId]
    );
    const c = countsResult.rows[0] || {};
    const total30 = Number(c.total30 || 0);
    const resolved30 = Number(c.resolved30 || 0);

    const avgResult = await db.query(
      `SELECT EXTRACT(EPOCH FROM AVG(resolved_at - created_at)) / 3600 AS avg_hours
       FROM events
       WHERE couple_id = $1 AND status = 'resolved' AND resolved_at IS NOT NULL`,
      [coupleId]
    );
    const avgHours = avgResult.rows[0]?.avg_hours;

    const tagResult = await db.query(
      `SELECT tag, COUNT(*)::int AS count
       FROM (SELECT UNNEST(tags) AS tag FROM events WHERE couple_id = $1) t
       GROUP BY tag
       ORDER BY count DESC`,
      [coupleId]
    );

    // Which emotions show up most across this couple's events — so the user can
    // recognise their recurring feelings and learn how to "接住" each one.
    const emotionResult = await db.query(
      `SELECT emotion, COUNT(*)::int AS count
       FROM (SELECT UNNEST(emotions) AS emotion FROM events WHERE couple_id = $1) e
       GROUP BY emotion
       ORDER BY count DESC`,
      [coupleId]
    );

    const dailyResult = await db.query(
      `SELECT TO_CHAR(d::date, 'YYYY-MM-DD') AS date,
              COALESCE(cnt, 0)::int AS count
       FROM generate_series(NOW()::date - INTERVAL '29 days', NOW()::date, INTERVAL '1 day') d
       LEFT JOIN (
         SELECT DATE(created_at) AS day, COUNT(*) AS cnt
         FROM events
         WHERE couple_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY day
       ) e ON e.day = d::date
       ORDER BY d`,
      [coupleId]
    );

    const hotspotResult = await db.query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS count
       FROM events WHERE couple_id = $1
       GROUP BY hour ORDER BY count DESC LIMIT 24`,
      [coupleId]
    );

    res.json({
      success: true,
      analytics: {
        counts: { last7: Number(c.last7 || 0), last30: total30 },
        resolution_rate: total30 > 0 ? Math.round((resolved30 / total30) * 100) : 0,
        avg_resolution_hours: avgHours != null ? Number(Number(avgHours).toFixed(1)) : null,
        tag_distribution: tagResult.rows,
        emotion_distribution: emotionResult.rows,
        daily_trend: dailyResult.rows,
        hotspot_hours: hotspotResult.rows,
      },
    });
  } catch (err) {
    logError('Event analytics failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法取得分析資料' });
  }
});

// List events for caller's couple
router.get(
  '/',
  [
    query('status').optional().isIn(['open', 'resolve_pending', 'resolved', 'all']),
    query('tag').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const couple = await getCoupleForUser(userId);
      if (!couple) return res.json({ success: true, events: [], total: 0 });

      const { status = 'all', tag, limit = 50, offset = 0 } = req.query;

      const conds = ['e.couple_id = $1', '(e.is_private = FALSE OR e.created_by = $2)'];
      const params = [couple.couple_id, userId];
      let i = 3;
      if (status !== 'all') {
        conds.push(`e.status = $${i++}`);
        params.push(status);
      }
      if (tag) {
        conds.push(`$${i++} = ANY(e.tags)`);
        params.push(tag);
      }

      const where = conds.join(' AND ');

      const countResult = await db.query(`SELECT COUNT(*) FROM events e WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].count, 10);

      params.push(parseInt(limit, 10), parseInt(offset, 10));

      const listResult = await db.query(
        `SELECT e.*,
                (SELECT content FROM event_messages m WHERE m.event_id = e.id
                   ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
                (SELECT COUNT(*) FROM event_messages m
                   WHERE m.event_id = e.id AND m.sender_id <> $2 AND m.read_at IS NULL)::int AS unread_count
         FROM events e
         WHERE ${where}
         ORDER BY e.created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
        params
      );

      const events = listResult.rows.map((row) =>
        serializeEvent(row, {
          last_message_preview: row.last_message_preview,
          unread_count: row.unread_count || 0,
        })
      );

      res.json({ success: true, events, total });
    } catch (err) {
      logError('List events failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '無法取得事件列表' });
    }
  }
);

// Event detail with full message log
router.get('/:id', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    if (access.event.is_private && access.event.created_by !== req.user.id) {
      return res.status(403).json({ success: false, message: '此為私人事件' });
    }

    const messagesResult = await db.query(
      `SELECT * FROM event_messages WHERE event_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({
      success: true,
      event: serializeEvent(access.event, {
        messages: messagesResult.rows.map(serializeMessage),
      }),
    });
  } catch (err) {
    logError('Get event failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法取得事件詳情' });
  }
});

// Edit event title/summary — creator only, blocked once resolved. Edits are
// corrections, not new activity: no partner notification.
router.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('title').optional().isString().isLength({ min: 1, max: 120 }).withMessage('標題需在 1–120 字之間'),
    body('summary').optional().isString().isLength({ min: 1, max: 1000 }).withMessage('簡介需在 1–1000 字之間'),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const { title, summary } = req.body;
      if (title === undefined && summary === undefined) {
        return res.status(400).json({
          success: false,
          message: '沒有可更新的欄位',
          error_code: 'NO_EDITABLE_FIELDS',
        });
      }

      const access = await assertEventAccess(req.params.id, userId);
      if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
      if (access.event.created_by !== userId) {
        return res.status(403).json({
          success: false,
          message: '只有發起人可以編輯事件內容',
          error_code: 'NOT_EVENT_CREATOR',
        });
      }
      if (access.event.status === 'resolved') {
        return res.status(400).json({
          success: false,
          message: '此事件已解決，無法編輯',
          error_code: 'EVENT_RESOLVED',
        });
      }

      const result = await db.query(
        `UPDATE events
         SET title = COALESCE($2, title),
             summary = COALESCE($3, summary),
             content_edited_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [req.params.id, title ?? null, summary ?? null]
      );

      logInfo('events.edited', {
        userId,
        eventId: req.params.id,
        fields: [title !== undefined && 'title', summary !== undefined && 'summary'].filter(Boolean),
      });

      res.json({ success: true, event: serializeEvent(result.rows[0]) });
    } catch (err) {
      logError('Edit event failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '編輯事件失敗，請稍後再試' });
    }
  }
);

// Edit own message in an event thread. Sender only, never AI messages, blocked
// once resolved. read_at is kept — the partner sees an 「已編輯」 marker instead.
router.patch(
  '/:id/messages/:msgId',
  [
    param('id').isUUID(),
    param('msgId').isUUID(),
    body('content').isString().isLength({ min: 1, max: 2000 }).withMessage('訊息需在 1–2000 字之間'),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const access = await assertEventAccess(req.params.id, userId);
      if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({
          success: false,
          message: '私人事件無法編輯訊息',
          error_code: 'PRIVATE_EVENT',
        });
      }
      if (access.event.status === 'resolved') {
        return res.status(400).json({
          success: false,
          message: '此事件已解決，無法編輯訊息',
          error_code: 'EVENT_RESOLVED',
        });
      }

      // Guarded single-statement update keeps authorization race-free.
      const result = await db.query(
        `UPDATE event_messages
         SET content = $1, edited_at = NOW()
         WHERE id = $2 AND event_id = $3 AND sender_id = $4 AND is_ai = FALSE
         RETURNING *`,
        [req.body.content, req.params.msgId, req.params.id, userId]
      );

      if (result.rows.length === 0) {
        const existing = await db.query(
          `SELECT sender_id, is_ai FROM event_messages WHERE id = $1 AND event_id = $2`,
          [req.params.msgId, req.params.id]
        );
        if (existing.rows.length === 0) {
          return res.status(404).json({ success: false, message: '找不到訊息' });
        }
        if (existing.rows[0].is_ai) {
          return res.status(403).json({
            success: false,
            message: 'AI 諮商師的留言無法編輯',
            error_code: 'AI_MESSAGE_NOT_EDITABLE',
          });
        }
        return res.status(403).json({
          success: false,
          message: '只能編輯自己送出的訊息',
          error_code: 'NOT_MESSAGE_SENDER',
        });
      }

      await db.query(`UPDATE events SET updated_at = NOW() WHERE id = $1`, [req.params.id]);

      logInfo('events.message_edited', {
        userId,
        eventId: req.params.id,
        messageId: req.params.msgId,
      });

      res.json({ success: true, message: serializeMessage(result.rows[0]) });
    } catch (err) {
      logError('Edit event message failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '編輯訊息失敗，請稍後再試' });
    }
  }
);

// Post reply to an event
router.post(
  '/:id/messages',
  [param('id').isUUID(), body('content').isString().isLength({ min: 1, max: 2000 })],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人事件無法新增訊息' });
      }
      if (access.event.status === 'resolved') {
        return res.status(400).json({ success: false, message: '此事件已解決，無法新增訊息' });
      }

      const msgResult = await db.query(
        `INSERT INTO event_messages (event_id, sender_id, content)
         VALUES ($1, $2, $3) RETURNING *`,
        [req.params.id, req.user.id, req.body.content]
      );

      // Touch updated_at so list ordering reflects activity
      await db.query(`UPDATE events SET updated_at = NOW() WHERE id = $1`, [req.params.id]);

      await notify(
        access.partnerId,
        'event_reply',
        '伴侶在事件中回覆',
        access.event.title,
        req.params.id,
        req.user.id,
        2,
        req.body.content
      );

      res.status(201).json({ success: true, message: serializeMessage(msgResult.rows[0]) });
    } catch (err) {
      logError('Post event message failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '無法新增訊息' });
    }
  }
);

// Preview-only AI rewrite for a reply. Stateless — no DB write. Loads the
// event summary + recent messages so the LLM can rewrite the draft in context.
router.post(
  '/:id/messages/preview-rewrite',
  [
    param('id').isUUID(),
    body('rawReply').isString().isLength({ min: 1, max: 2000 }).withMessage('回覆需在 1–2000 字之間'),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人事件不支援 AI 回覆改寫' });
      }

      const userId = req.user.id;
      const rawReply = req.body.rawReply;
      logInfo('events.reply_rewrite.input', { userId, eventId: req.params.id, len: rawReply.length, raw: rawReply });

      // Shares the daily AI budget with the icebreaker (both hit the paid LLM).
      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('events.reply_rewrite.limit', { userId, used: usedToday, limit, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      const recent = await db.query(
        `SELECT sender_id, content
           FROM event_messages
          WHERE event_id = $1
          ORDER BY created_at DESC
          LIMIT 10`,
        [req.params.id]
      );
      const recentMessages = recent.rows.reverse().map((m) => ({
        fromSelf: m.sender_id === userId,
        content: m.content,
      }));

      const createdBySelf = access.event.created_by === userId;
      const genders = await getCoupleGenders(userId);

      const preview = await llmService.rewriteReply({
        rawReply,
        eventSummary: access.event.summary,
        recentMessages,
        createdBySelf,
        ...genders,
      });
      const meta = preview._meta;
      delete preview._meta;

      logInfo('events.reply_rewrite.cost', {
        userId,
        provider: meta?.provider,
        model: meta?.model,
        costUsd: meta?.costUsd,
        durationMs: meta?.durationMs,
        createdBySelf,
      });

      if (REPLY_PROMPT_LOG_REMAINING > 0 && meta?.assembledPrompt) {
        REPLY_PROMPT_LOG_REMAINING -= 1;
        logInfo('events.reply_rewrite.prompt', {
          userId,
          eventId: req.params.id,
          remaining: REPLY_PROMPT_LOG_REMAINING,
          prompt: meta.assembledPrompt,
        });
      }

      await recordAiUsage(userId, 'reply_rewrite', rawReply, meta);
      res.json({ success: true, preview });
    } catch (err) {
      logError('Reply rewrite preview failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: 'AI 改寫失敗，請稍後再試' });
    }
  }
);

// Preview-only AI "接住情緒" coaching for the receiver. Stateless — no DB write.
// Loads the event summary + recent messages so the LLM can coach the user on how
// to RECEIVE their partner's emotion (validate first, not solve). Mirrors the
// reply-rewrite route and shares the same daily AI budget.
router.post(
  '/:id/messages/preview-acceptance',
  [param('id').isUUID()],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人事件不支援 AI 接住情緒建議' });
      }

      const userId = req.user.id;
      logInfo('events.emotion_acceptance.input', { userId, eventId: req.params.id });

      const recent = await db.query(
        `SELECT sender_id, content
           FROM event_messages
          WHERE event_id = $1
          ORDER BY created_at DESC
          LIMIT 10`,
        [req.params.id]
      );
      const recentMessages = recent.rows.reverse().map((m) => ({
        fromSelf: m.sender_id === userId,
        content: m.content,
      }));

      const createdBySelf = access.event.created_by === userId;
      const genders = await getCoupleGenders(userId);

      // Cache first: an unchanged thread reuses the stored coaching for free —
      // no LLM tokens, no hit against the daily AI budget.
      const inputHash = aiCacheHash(['acceptance_v1', access.event.summary, recentMessages, createdBySelf, genders]);
      const cached = await getAiCache(req.params.id, userId, 'emotion_acceptance', inputHash);
      if (cached) {
        logInfo('events.emotion_acceptance.cache_hit', { userId, eventId: req.params.id });
        return res.json({ success: true, preview: cached, cached: true });
      }

      // Shares the daily AI budget with the icebreaker (both hit the paid LLM).
      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('events.emotion_acceptance.limit', { userId, used: usedToday, limit, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      const preview = await llmService.generateEmotionAcceptance({
        eventSummary: access.event.summary,
        recentMessages,
        createdBySelf,
        ...genders,
      });
      const meta = preview._meta;
      delete preview._meta;

      logInfo('events.emotion_acceptance.cost', {
        userId,
        provider: meta?.provider,
        model: meta?.model,
        costUsd: meta?.costUsd,
        durationMs: meta?.durationMs,
        createdBySelf,
      });

      await recordAiUsage(userId, 'emotion_acceptance', access.event.summary, meta);
      await saveAiCache(req.params.id, userId, 'emotion_acceptance', inputHash, preview);
      res.json({ success: true, preview });
    } catch (err) {
      logError('Emotion acceptance preview failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: 'AI 接住情緒建議暫時無法產生，請稍後再試' });
    }
  }
);

// Preview an AI 諮商師 (counselor) comment for an event thread. Generates but
// does NOT persist — the inviter reviews it, then POSTs it into the thread.
// Counts against the shared daily AI budget. Mirrors the wall counselor.
router.post('/:id/ai-comment/preview', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    if (access.event.is_private) {
      return res.status(403).json({ success: false, message: '私人事件無法邀請 AI 諮商師' });
    }

    const userId = req.user.id;

    const msgs = await db.query(
      `SELECT m.content, m.is_ai, u.nickname AS author_nickname
         FROM event_messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.event_id = $1
        ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    const replies = msgs.rows.map((r) => ({
      authorName: r.author_nickname,
      content: r.content,
      isAi: r.is_ai === true,
    }));

    const companion = await getUserCompanion(userId);

    // Cache first: same thread + same persona → reuse the stored comment for
    // free (no LLM tokens, no daily-budget hit).
    const inputHash = aiCacheHash(['counselor_v1', access.event.summary, replies, companion.id]);
    const cached = await getAiCache(req.params.id, userId, 'event_counselor', inputHash);
    if (cached) {
      logInfo('events.ai_comment.cache_hit', { userId, eventId: req.params.id, companion: companion.id });
      return res.json({ success: true, comment: cached.comment, cached: true });
    }

    const { tier, limit } = await resolveAiLimit(userId);
    const usedToday = await countTodayAiUsage(userId);
    const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
    if (!limitCheck.ok) {
      logInfo('events.ai_comment.limit', { userId, eventId: req.params.id, used: usedToday, limit, tier, blocked: true });
      return res.status(limitCheck.status).json(limitCheck.body);
    }

    logInfo('events.ai_comment.preview', { userId, eventId: req.params.id, replyCount: replies.length, companion: companion.id });

    const result = await llmService.generateWallCounselorComment({
      postContent: access.event.summary,
      postAuthorName: '發起人',
      moodTag: (access.event.emotions || []).join('、') || null,
      replies,
      companion,
    });
    const meta = result._meta;
    delete result._meta;

    logInfo('events.ai_comment.cost', {
      userId,
      eventId: req.params.id,
      provider: meta?.provider,
      model: meta?.model,
      costUsd: meta?.costUsd,
      durationMs: meta?.durationMs,
    });

    await recordAiUsage(userId, 'event_counselor', access.event.summary, meta);
    await saveAiCache(req.params.id, userId, 'event_counselor', inputHash, { comment: result.comment });

    res.json({ success: true, comment: result.comment });
  } catch (err) {
    logError('Event AI comment preview failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: 'AI 諮商師暫時無法回應，請稍後再試' });
  }
});

// Post a previewed AI 諮商師 comment into the event thread, visible to both
// partners. author_id = the inviting partner; is_ai flags it as a counselor msg.
router.post(
  '/:id/ai-comment',
  [param('id').isUUID(), body('content').isString().isLength({ min: 1, max: 2000 })],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人事件無法新增訊息' });
      }
      if (access.event.status === 'resolved') {
        return res.status(400).json({ success: false, message: '此事件已解決，無法新增訊息' });
      }

      const companion = await getUserCompanion(req.user.id);
      const msgResult = await db.query(
        `INSERT INTO event_messages (event_id, sender_id, content, is_ai, ai_therapist)
         VALUES ($1, $2, $3, TRUE, $4) RETURNING *`,
        [req.params.id, req.user.id, req.body.content, companion.id]
      );
      await db.query(`UPDATE events SET updated_at = NOW() WHERE id = $1`, [req.params.id]);

      logInfo('events.ai_comment.posted', { userId: req.user.id, eventId: req.params.id, messageId: msgResult.rows[0].id, companion: companion.id });

      await notify(
        access.partnerId,
        'event_ai_comment',
        `AI 諮商師 ${companion.name} 在事件中留言`,
        access.event.title,
        req.params.id,
        req.user.id,
        2,
        req.body.content,
        companion.name
      );

      res.status(201).json({ success: true, message: serializeMessage(msgResult.rows[0]) });
    } catch (err) {
      logError('Post event AI comment failed', { err: err.message, stack: err.stack, eventId: req.params.id });
      res.status(500).json({ success: false, message: '無法新增 AI 留言' });
    }
  }
);

// ---------------------------------------------------------------------------
// 情緒翻譯 (emotion / need translation) — shared per-thread lens
// ---------------------------------------------------------------------------

// Toggle the shared translation lens for an event thread. Either partner can
// flip it; the state is stored on the event so both load the same on/off view.
router.patch(
  '/:id/translation',
  [param('id').isUUID(), body('enabled').isBoolean()],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人事件無法開啟情緒翻譯', error_code: 'PRIVATE_EVENT' });
      }
      const enabled = req.body.enabled === true;
      await db.query(`UPDATE events SET translation_enabled = $2 WHERE id = $1`, [req.params.id, enabled]);
      logInfo('events.translation.toggle', { userId: req.user.id, eventId: req.params.id, enabled });
      res.json({ success: true, translation_enabled: enabled });
    } catch (err) {
      logError('Toggle event translation failed', { err: err.message, stack: err.stack, eventId: req.params.id });
      res.status(500).json({ success: false, message: '無法更新情緒翻譯設定，請稍後再試' });
    }
  }
);

// Return the emotion/need translation for every human message in the thread.
// Cached per message (messages are immutable), so only the still-untranslated
// ones cost one batched LLM call + one shared-budget unit; a fully cached
// thread costs nothing.
router.get('/:id/translations', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    if (access.event.is_private) {
      return res.status(403).json({ success: false, message: '私人事件無法使用情緒翻譯', error_code: 'PRIVATE_EVENT' });
    }
    const userId = req.user.id;

    const msgs = await db.query(
      `SELECT m.id, m.content, m.is_ai, u.nickname AS author_nickname
         FROM event_messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.event_id = $1
        ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    const humanIds = msgs.rows.filter((r) => r.is_ai !== true).map((r) => r.id);

    // Load whatever is already cached for this thread's human messages.
    const cachedRows = humanIds.length > 0
      ? (await db.query(
          `SELECT message_id, translation FROM message_need_translations
            WHERE surface = 'event' AND message_id = ANY($1::uuid[])`,
          [humanIds]
        )).rows
      : [];
    const translations = {};
    for (const row of cachedRows) translations[row.message_id] = row.translation;

    const missing = humanIds.filter((id) => !translations[id]);

    if (missing.length > 0) {
      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('events.translation.limit', { userId, eventId: req.params.id, used: usedToday, limit, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      const threadForModel = msgs.rows.map((r) => ({
        id: r.id,
        speaker: r.is_ai === true ? 'AI 諮商師' : (r.author_nickname || '某人'),
        content: r.content,
      }));

      logInfo('events.translation.generate', { userId, eventId: req.params.id, missing: missing.length });

      const result = await llmService.generateThreadTranslations({
        messages: threadForModel,
        targetIds: missing,
        context: { summary: access.event.summary },
      });
      const meta = result._meta;
      delete result._meta;

      logInfo('events.translation.cost', {
        userId,
        eventId: req.params.id,
        provider: meta?.provider,
        model: meta?.model,
        costUsd: meta?.costUsd,
        durationMs: meta?.durationMs,
      });

      await recordAiUsage(userId, 'need_translation', access.event.summary, meta);

      for (const t of result.translations || []) {
        if (!missing.includes(t.id)) continue;
        const payload = { emotions: t.emotions || [], need: t.need || '', rewrite: t.rewrite || '' };
        translations[t.id] = payload;
        try {
          await db.query(
            `INSERT INTO message_need_translations (surface, message_id, couple_id, translation)
             VALUES ('event', $1, $2, $3)
             ON CONFLICT (surface, message_id) DO UPDATE SET translation = EXCLUDED.translation`,
            [t.id, access.coupleId, JSON.stringify(payload)]
          );
        } catch (err) {
          logWarn('save event translation failed', { messageId: t.id, err: err.message });
        }
      }
    }

    res.json({ success: true, translations });
  } catch (err) {
    logError('Get event translations failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '情緒翻譯暫時無法產生，請稍後再試' });
  }
});

// ---------------------------------------------------------------------------
// 治療摘要 (Therapy Note) — post-conflict structured summary
// ---------------------------------------------------------------------------

// Return the therapy note for a resolved event. Generated once (the first
// partner to open the resolved event triggers it) and stored on the event, so
// both partners read the same note and re-opens cost nothing.
router.get('/:id/therapy-note', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    if (access.event.is_private) {
      return res.status(403).json({ success: false, message: '私人事件沒有治療摘要', error_code: 'PRIVATE_EVENT' });
    }
    if (access.event.status !== 'resolved') {
      return res.status(400).json({
        success: false,
        message: '事件解決後，AI 才會為你們整理這次衝突的治療摘要。',
        error_code: 'EVENT_NOT_RESOLVED',
      });
    }
    const userId = req.user.id;

    // Already generated → return the shared note for free.
    if (access.event.therapy_note) {
      return res.json({ success: true, therapyNote: access.event.therapy_note, cached: true });
    }

    const msgs = await db.query(
      `SELECT m.content, m.is_ai, u.nickname AS author_nickname
         FROM event_messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.event_id = $1
        ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    const messages = msgs.rows.map((r) => ({
      speaker: r.author_nickname || '某人',
      content: r.content,
      isAi: r.is_ai === true,
    }));

    const { tier, limit } = await resolveAiLimit(userId);
    const usedToday = await countTodayAiUsage(userId);
    const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
    if (!limitCheck.ok) {
      logInfo('events.therapy_note.limit', { userId, eventId: req.params.id, used: usedToday, limit, tier, blocked: true });
      return res.status(limitCheck.status).json(limitCheck.body);
    }

    logInfo('events.therapy_note.generate', { userId, eventId: req.params.id, messageCount: messages.length });

    const result = await llmService.generateTherapyNote({
      eventSummary: access.event.summary,
      messages,
    });
    const meta = result._meta;
    delete result._meta;

    logInfo('events.therapy_note.cost', {
      userId,
      eventId: req.params.id,
      provider: meta?.provider,
      model: meta?.model,
      costUsd: meta?.costUsd,
      durationMs: meta?.durationMs,
    });

    await recordAiUsage(userId, 'therapy_note', access.event.summary, meta);
    await db.query(`UPDATE events SET therapy_note = $2 WHERE id = $1`, [req.params.id, JSON.stringify(result)]);

    res.json({ success: true, therapyNote: result });
  } catch (err) {
    logError('Get event therapy note failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '治療摘要暫時無法產生，請稍後再試' });
  }
});

// Mark an inbound message as read
router.put(
  '/:id/messages/:msgId/read',
  [param('id').isUUID(), param('msgId').isUUID()],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });

      const result = await db.query(
        `UPDATE event_messages
           SET read_at = NOW()
         WHERE id = $1 AND event_id = $2 AND sender_id <> $3 AND read_at IS NULL
         RETURNING *`,
        [req.params.msgId, req.params.id, req.user.id]
      );

      res.json({ success: true, message: result.rows[0] ? serializeMessage(result.rows[0]) : null });
    } catch (err) {
      logError('Mark message read failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '無法更新已讀狀態' });
    }
  }
);

// Share an event thread into the public 公開問答 (anonymised, read-only). Either
// partner can publish their couple's event; a single-party toggle with an
// in-app warning on the client. Private events can't be shared (no shared thread).
router.post(
  '/:id/publish',
  [param('id').isUUID(), body('title').optional().isString().isLength({ max: 200 })],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
      if (access.event.is_private) {
        return res.status(400).json({ success: false, message: '私人事件無法公開分享' });
      }
      const title = (req.body.title && req.body.title.trim()) || access.event.title;
      const result = await db.query(
        `UPDATE events
            SET public_status = 'published', public_title = $2,
                published_at = NOW(), published_by = $3
          WHERE id = $1
          RETURNING *`,
        [req.params.id, title, req.user.id]
      );
      logInfo('events.published', { userId: req.user.id, eventId: req.params.id });
      res.json({
        success: true,
        message: '已匿名公開到公開問答，謝謝你願意幫助其他人。',
        event: serializeEvent(result.rows[0]),
      });
    } catch (err) {
      logError('Publish event failed', { err: err.message, stack: err.stack, eventId: req.params.id });
      res.status(500).json({ success: false, message: '公開失敗，請稍後再試' });
    }
  }
);

// Un-share a previously published event.
router.post('/:id/unpublish', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    const result = await db.query(
      `UPDATE events
          SET public_status = 'private', published_at = NULL
        WHERE id = $1
        RETURNING *`,
      [req.params.id]
    );
    logInfo('events.unpublished', { userId: req.user.id, eventId: req.params.id });
    res.json({
      success: true,
      message: '已取消公開，這個對話不再顯示於公開問答。',
      event: serializeEvent(result.rows[0]),
    });
  } catch (err) {
    logError('Unpublish event failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '取消公開失敗，請稍後再試' });
  }
});

// One side requests "mark as resolved"
router.post('/:id/resolve-request', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    if (access.event.is_private) {
      return res.status(400).json({ success: false, message: '私人事件不需雙方確認，請使用解決 API' });
    }
    if (access.event.status !== 'open') {
      return res.status(400).json({ success: false, message: '事件目前無法發起解決請求' });
    }

    const result = await db.query(
      `UPDATE events
         SET status = 'resolve_pending',
             resolve_requested_by = $2,
             resolve_requested_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, req.user.id]
    );

    await notify(
      access.partnerId,
      'event_resolve_request',
      '伴侶希望標記事件為已解決',
      access.event.title,
      req.params.id,
      req.user.id
    );

    res.json({ success: true, event: serializeEvent(result.rows[0]) });
  } catch (err) {
    logError('Resolve-request failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法發起解決請求' });
  }
});

// The other side confirms — flips to resolved
router.post('/:id/resolve-confirm', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    if (access.event.status !== 'resolve_pending') {
      return res.status(400).json({ success: false, message: '事件目前不在等待確認的狀態' });
    }
    if (access.event.resolve_requested_by === req.user.id) {
      return res.status(400).json({ success: false, message: '需由另一方確認解決' });
    }

    const result = await db.query(
      `UPDATE events
         SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    await notify(
      access.partnerId,
      'event_resolved',
      '事件已解決',
      access.event.title,
      req.params.id,
      req.user.id
    );

    res.json({ success: true, event: serializeEvent(result.rows[0]) });
  } catch (err) {
    logError('Resolve-confirm failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法確認解決' });
  }
});

// Re-open a resolved event so the couple can keep discussing it.
router.post('/:id/reopen', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    if (access.event.is_private) {
      return res.status(400).json({ success: false, message: '私人事件無法重新開啟' });
    }
    if (access.event.status !== 'resolved') {
      return res.status(400).json({ success: false, message: '只有已解決的事件可以重新開啟' });
    }

    const result = await db.query(
      `UPDATE events
         SET status = 'open',
             resolved_at = NULL,
             resolve_requested_by = NULL,
             resolve_requested_at = NULL,
             therapy_note = NULL,
             updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    await notify(
      access.partnerId,
      'event_reopened',
      '伴侶重新開啟了一個事件',
      access.event.title,
      req.params.id,
      req.user.id
    );

    logInfo('events.reopened', { userId: req.user.id, eventId: req.params.id });
    res.json({ success: true, event: serializeEvent(result.rows[0]) });
  } catch (err) {
    logError('Reopen event failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法重新開啟事件' });
  }
});

// ===========================================================================
// Therapist Mode ("引導模式") — facilitated, turn-based therapy sessions.
// The companion joins the event thread as a third participant, runs one small
// exercise "card" at a time, waits for the right partner, and scores responses.
// Additive: the one-shot "請 AI 諮商師加入" advice route above stays as-is.
// ===========================================================================

// Stable A/B roles: A = the event creator, B = the partner. Used so the model
// (and turn tracking) can address "先請 A / 換 B" consistently.
async function loadFacilitationPartners(event) {
  const r = await db.query(
    `SELECT u.id, u.nickname, u.gender
       FROM couples c JOIN users u ON u.id IN (c.user1_id, c.user2_id)
      WHERE c.id = $1`,
    [event.couple_id]
  );
  const byId = new Map(r.rows.map((row) => [row.id, row]));
  const a = byId.get(event.created_by) || null;
  const bRow = r.rows.find((row) => row.id !== event.created_by) || null;
  return {
    A: a ? { id: a.id, name: a.nickname, gender: a.gender || null } : { id: event.created_by, name: '夥伴 A', gender: null },
    B: bRow ? { id: bRow.id, name: bRow.nickname, gender: bRow.gender || null } : null,
  };
}

function roleOfUser(userId, partners) {
  if (partners.A && userId === partners.A.id) return 'A';
  if (partners.B && userId === partners.B.id) return 'B';
  return null;
}

function targetUserId(target, partners) {
  if (target === 'A') return partners.A?.id || null;
  if (target === 'B') return partners.B?.id || null;
  return null; // 'both' → either partner may act next
}

// Recent thread as A/B/facilitator turns for the generator.
async function loadFacilitationThread(eventId, partners, limit = 16) {
  const r = await db.query(
    `SELECT sender_id, content, is_ai FROM event_messages
      WHERE event_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [eventId, limit]
  );
  return r.rows.reverse().map((m) => ({
    role: m.is_ai === true ? 'facilitator' : (roleOfUser(m.sender_id, partners) || 'A'),
    content: m.content,
  }));
}

// Shape a session row for the frontend (scoreboard + turn state). Only what the
// UI consumes — raw skill accounting and card-id lists stay server-side.
function serializeSession(row) {
  if (!row) return null;
  return {
    status: row.status,
    activeCardMeta: row.active_card ? cardMeta(row.active_card) : null,
    turnOwner: row.turn_owner || null,
    completedCardsMeta: (row.completed_cards || []).map(cardMeta).filter(Boolean),
    skillScore: scoreSession(row.skill_scores || {}),
  };
}

async function getSessionRow(eventId) {
  const r = await db.query(`SELECT * FROM event_facilitation_sessions WHERE event_id = $1`, [eventId]);
  return r.rows[0] || null;
}

// Persist an AI facilitator turn as an event message (say = content, structured
// turn in the facilitation JSONB) and notify the partner it's addressed to.
async function postFacilitatorTurn(eventId, userId, companion, turn, partners) {
  const targetId = targetUserId(turn.target, partners);
  const payload = {
    card: turn.card,
    cardMeta: turn.cardMeta,
    target: turn.target,
    targetUserId: targetId,
    instruction: turn.instruction,
    quickReplies: turn.quickReplies || [],
    evaluation: turn.evaluation || null,
    // The evaluation grades the PREVIOUS exercise; name it so the badge can't
    // be misread as grading the new card.
    evaluatedCardMeta: turn.evaluatedCardMeta || null,
    sessionDone: turn.sessionDone === true,
  };
  const content = turn.say || turn.instruction || '';
  const msg = await db.query(
    `INSERT INTO event_messages (event_id, sender_id, content, is_ai, ai_therapist, facilitation)
     VALUES ($1, $2, $3, TRUE, $4, $5) RETURNING *`,
    [eventId, userId, content, companion.id, JSON.stringify(payload)]
  );
  await db.query(`UPDATE events SET updated_at = NOW() WHERE id = $1`, [eventId]);
  return msg.rows[0];
}

// Shared guard for the two AI-producing facilitation routes. Each rejection is
// logged so Cloud Logging shows how often users hit these walls, not just when
// the feature succeeds.
async function facilitationPreflight(access, res, userId) {
  const blocked = (reason) =>
    logInfo('events.facilitation.blocked', { userId, eventId: access.event.id, reason });
  if (access.event.is_private) {
    blocked('private_event');
    res.status(403).json({ success: false, message: '私人事件無法使用引導模式', error_code: 'PRIVATE_EVENT' });
    return false;
  }
  if (access.event.status === 'resolved') {
    blocked('event_resolved');
    res.status(400).json({ success: false, message: '此事件已解決，如需再談可先重新開啟事件', error_code: 'EVENT_RESOLVED' });
    return false;
  }
  if (!access.partnerId) {
    blocked('not_paired');
    res.status(400).json({
      success: false,
      message: '引導模式需要兩個人一起練習。先邀請另一半配對，配對後就能一起進行；在那之前，你仍可用「請 AI 諮商師加入」聽聽建議。',
      error_code: 'NOT_PAIRED',
    });
    return false;
  }
  return true;
}

// GET the current session state + scoreboard (null when none started).
router.get('/:id/facilitation', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    const row = await getSessionRow(req.params.id);
    res.json({ success: true, session: serializeSession(row) });
  } catch (err) {
    logError('Get facilitation failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '無法載入引導進度，請稍後再試' });
  }
});

// START (or resume) a facilitated session. Idempotent AND race-safe: the
// session row is claimed (step_count = 0 marks an in-flight claim) BEFORE the
// LLM call, so two partners tapping 開始引導 simultaneously produce one turn and
// one charge — the loser resumes the winner's session for free.
router.post('/:id/facilitation/start', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    const userId = req.user.id;
    if (!(await facilitationPreflight(access, res, userId))) return;

    const { tier, limit } = await resolveAiLimit(userId);
    const usedToday = await countTodayAiUsage(userId);
    const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
    if (!limitCheck.ok) {
      logInfo('events.facilitation.limit', { userId, eventId: req.params.id, used: usedToday, limit, tier, blocked: true });
      return res.status(limitCheck.status).json(limitCheck.body);
    }

    // Claim the slot. No row back = a session row already exists.
    let claim = (await db.query(
      `INSERT INTO event_facilitation_sessions (event_id, status, step_count)
       VALUES ($1, 'active', 0)
       ON CONFLICT (event_id) DO NOTHING RETURNING *`,
      [req.params.id]
    )).rows[0];
    if (!claim) {
      const existing = await getSessionRow(req.params.id);
      if (existing && existing.status === 'active') {
        // Already running (or another request is mid-start): resume, no charge.
        return res.json({ success: true, session: serializeSession(existing), message: null });
      }
      // Ended session: claim the restart. 0 rows = someone else just did.
      claim = (await db.query(
        `UPDATE event_facilitation_sessions
            SET status = 'active', active_card = NULL, turn_owner = NULL,
                completed_cards = '{}', skill_scores = '{}'::jsonb, step_count = 0,
                started_at = NOW(), updated_at = NOW()
          WHERE event_id = $1 AND status = 'ended' RETURNING *`,
        [req.params.id]
      )).rows[0];
      if (!claim) {
        const current = await getSessionRow(req.params.id);
        return res.json({ success: true, session: serializeSession(current), message: null });
      }
    }

    logInfo('events.facilitation.start', { userId, eventId: req.params.id });

    let turn;
    try {
      const [partners, companion] = await Promise.all([
        loadFacilitationPartners(access.event),
        getUserCompanion(userId),
      ]);
      const thread = await loadFacilitationThread(req.params.id, partners);

      turn = await llmService.generateFacilitatorTurn({
        thread,
        session: { activeCard: null, turnOwnerRole: null, completedCards: [], stepCount: 0 },
        partners,
        companion,
        context: { summary: access.event.summary },
      });
      const meta = turn._meta;
      delete turn._meta;

      const turnOwner = targetUserId(turn.target, partners);
      const status = turn.sessionDone ? 'ended' : 'active';
      const sessionRow = (await db.query(
        `UPDATE event_facilitation_sessions
            SET status = $2, active_card = $3, turn_owner = $4, step_count = 1, updated_at = NOW()
          WHERE event_id = $1 RETURNING *`,
        [req.params.id, status, turn.card, turnOwner]
      )).rows[0];

      const aiMsg = await postFacilitatorTurn(req.params.id, userId, companion, turn, partners);
      await recordAiUsage(userId, 'facilitation_turn', access.event.summary || '引導', meta);

      logInfo('events.facilitation.cost', {
        userId, eventId: req.params.id, phase: 'start',
        provider: meta?.provider, model: meta?.model, costUsd: meta?.costUsd, durationMs: meta?.durationMs, card: turn.card,
      });

      await notify(
        access.partnerId, 'event_ai_comment',
        `${companion.name} 開始了一段引導練習`, access.event.title,
        req.params.id, userId, 2, turn.say, companion.name
      );

      res.status(201).json({ success: true, session: serializeSession(sessionRow), message: serializeMessage(aiMsg) });
    } catch (genErr) {
      // Release the claim so a retry isn't stuck resuming an empty session.
      await db.query(
        `DELETE FROM event_facilitation_sessions WHERE event_id = $1 AND step_count = 0`,
        [req.params.id]
      ).catch(() => {});
      throw genErr;
    }
  } catch (err) {
    logError('Start facilitation failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '無法開始引導，請稍後再試' });
  }
});

// ADVANCE the session: score the awaited partner's latest reply and produce the
// next turn. Race-safe and no-op-safe: (a) when the latest thread entry is still
// the facilitator's, nobody has responded — return current state without an LLM
// call; (b) the step is claimed with an optimistic step_count check BEFORE the
// LLM call, so two clients advancing simultaneously produce one turn, one charge.
router.post('/:id/facilitation/next', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    const userId = req.user.id;

    const session = await getSessionRow(req.params.id);
    if (!session || session.status !== 'active') {
      return res.status(400).json({ success: false, message: '目前沒有進行中的引導', error_code: 'NO_SESSION' });
    }
    if (!(await facilitationPreflight(access, res, userId))) return;

    const [partners, companion] = await Promise.all([
      loadFacilitationPartners(access.event),
      getUserCompanion(userId),
    ]);
    const thread = await loadFacilitationThread(req.params.id, partners);

    // Only advance if the couple has actually responded since the last AI turn.
    if (thread.length === 0 || thread[thread.length - 1].role === 'facilitator') {
      return res.json({ success: true, session: serializeSession(session), message: null });
    }

    const { tier, limit } = await resolveAiLimit(userId);
    const usedToday = await countTodayAiUsage(userId);
    const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
    if (!limitCheck.ok) {
      logInfo('events.facilitation.limit', { userId, eventId: req.params.id, used: usedToday, limit, tier, blocked: true });
      return res.status(limitCheck.status).json(limitCheck.body);
    }

    // Claim this step: whoever bumps step_count first generates; the loser gets
    // the winner's fresh state back instead of a second turn + second charge.
    const claimed = (await db.query(
      `UPDATE event_facilitation_sessions
          SET step_count = step_count + 1, updated_at = NOW()
        WHERE event_id = $1 AND step_count = $2 AND status = 'active' RETURNING *`,
      [req.params.id, session.step_count]
    )).rows[0];
    if (!claimed) {
      const current = await getSessionRow(req.params.id);
      return res.json({ success: true, session: serializeSession(current), message: null });
    }

    const turnOwnerRole = session.turn_owner ? roleOfUser(session.turn_owner, partners) : null;
    const turn = await llmService.generateFacilitatorTurn({
      thread,
      session: {
        activeCard: session.active_card,
        turnOwnerRole,
        completedCards: session.completed_cards || [],
        stepCount: session.step_count || 0,
      },
      partners,
      companion,
      context: { summary: access.event.summary },
    });
    const meta = turn._meta;
    delete turn._meta;

    // Grade the card the couple JUST practised (the session's active card), then
    // mark it complete when the facilitator moves on to a different card.
    // applyVerdict itself ignores non-evaluable cards.
    let skillScores = session.skill_scores || {};
    if (turn.evaluation && session.active_card) {
      skillScores = applyVerdict(skillScores, session.active_card, turn.evaluation.verdict);
      turn.evaluatedCardMeta = cardMeta(session.active_card);
    }
    const completed = session.completed_cards || [];
    if (session.active_card && turn.card !== session.active_card && !completed.includes(session.active_card)) {
      completed.push(session.active_card);
    }

    const turnOwner = targetUserId(turn.target, partners);
    const status = turn.sessionDone ? 'ended' : 'active';
    const sessionRow = (await db.query(
      `UPDATE event_facilitation_sessions
          SET status = $2, active_card = $3, turn_owner = $4, completed_cards = $5,
              skill_scores = $6, updated_at = NOW()
        WHERE event_id = $1 RETURNING *`,
      [req.params.id, status, turn.card, turnOwner, completed, JSON.stringify(skillScores)]
    )).rows[0];

    const aiMsg = await postFacilitatorTurn(req.params.id, userId, companion, turn, partners);
    await recordAiUsage(userId, 'facilitation_turn', access.event.summary || '引導', meta);

    logInfo('events.facilitation.cost', {
      userId, eventId: req.params.id, phase: 'next',
      provider: meta?.provider, model: meta?.model, costUsd: meta?.costUsd, durationMs: meta?.durationMs,
      card: turn.card, verdict: turn.evaluation?.verdict || null, done: turn.sessionDone,
    });

    await notify(
      access.partnerId, 'event_ai_comment',
      `${companion.name} 在引導練習中留言`, access.event.title,
      req.params.id, userId, 2, turn.say, companion.name
    );

    res.status(201).json({ success: true, session: serializeSession(sessionRow), message: serializeMessage(aiMsg) });
  } catch (err) {
    logError('Advance facilitation failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '引導暫時無法繼續，請稍後再試' });
  }
});

// END the session (no LLM, no quota).
router.post('/:id/facilitation/end', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
    const row = (await db.query(
      `UPDATE event_facilitation_sessions SET status = 'ended', updated_at = NOW()
        WHERE event_id = $1 RETURNING *`,
      [req.params.id]
    )).rows[0];
    logInfo('events.facilitation.end', { userId: req.user.id, eventId: req.params.id });
    res.json({ success: true, session: serializeSession(row) });
  } catch (err) {
    logError('End facilitation failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '無法結束引導，請稍後再試' });
  }
});

module.exports = router;
module.exports.TAG_VOCAB = TAG_VOCAB;
