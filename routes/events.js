const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const llmService = require('../services/llmService');

const router = express.Router();

router.use(authenticateToken);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TAG_VOCAB = ['語氣', '誤會', '家務', '行程', '金錢', '育兒', '家人'];
const VERSION_KEYS = ['neutral', 'firm', 'warm'];

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
    console.warn('⚠️ ensureNotificationsTable failed:', err.message);
  }
}

async function notify(userId, type, title, content, eventId, relatedUserId, priority = 2) {
  try {
    await ensureNotificationsTable();
    await db.query(
      `INSERT INTO notifications (user_id, notification_type, title, content, event_id, related_user_id, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, type, title, content, eventId, relatedUserId || null, priority]
    );
  } catch (err) {
    console.warn(`⚠️ notify(${type}) failed:`, err.message);
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
    status: row.status,
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
    created_at: row.created_at,
    read_at: row.read_at,
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

// Preview only — no DB write. Raw text never leaves this request cycle.
router.post(
  '/icebreaker',
  [body('rawText').isString().isLength({ min: 1, max: 4000 }).withMessage('原始文字需在 1–4000 字之間')],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const preview = await llmService.generateIcebreaker(req.body.rawText);
      res.json({ success: true, preview });
    } catch (err) {
      console.error('Icebreaker preview error:', err);
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
        const msgResult = await db.query(
          `INSERT INTO event_messages (event_id, sender_id, content)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [eventId, userId, versionMap[selected_version]]
        );
        firstMessage = msgResult.rows[0];
      }

      // Notify partner only for shared events.
      if (!event.is_private) {
        await notify(
          couple.partner_id,
          'event_created',
          '伴侶開啟了一個事件',
          event.title,
          eventId,
          userId
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
      console.error('Create event error:', err);
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
        daily_trend: dailyResult.rows,
        hotspot_hours: hotspotResult.rows,
      },
    });
  } catch (err) {
    console.error('Event analytics error:', err);
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
      console.error('List events error:', err);
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
    console.error('Get event error:', err);
    res.status(500).json({ success: false, message: '無法取得事件詳情' });
  }
});

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
        req.user.id
      );

      res.status(201).json({ success: true, message: serializeMessage(msgResult.rows[0]) });
    } catch (err) {
      console.error('Post event message error:', err);
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

      const recent = await db.query(
        `SELECT sender_id, content
           FROM event_messages
          WHERE event_id = $1
          ORDER BY created_at DESC
          LIMIT 5`,
        [req.params.id]
      );
      const recentMessages = recent.rows.reverse().map((m) => ({
        fromSelf: m.sender_id === req.user.id,
        content: m.content,
      }));

      const preview = await llmService.rewriteReply({
        rawReply: req.body.rawReply,
        eventSummary: access.event.summary,
        recentMessages,
      });
      res.json({ success: true, preview });
    } catch (err) {
      console.error('Reply rewrite preview error:', err);
      res.status(500).json({ success: false, message: 'AI 改寫失敗，請稍後再試' });
    }
  }
);

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
      console.error('Mark message read error:', err);
      res.status(500).json({ success: false, message: '無法更新已讀狀態' });
    }
  }
);

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
    console.error('Resolve-request error:', err);
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
    console.error('Resolve-confirm error:', err);
    res.status(500).json({ success: false, message: '無法確認解決' });
  }
});

module.exports = router;
module.exports.TAG_VOCAB = TAG_VOCAB;
