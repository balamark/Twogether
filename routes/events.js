const express = require('express');
const crypto = require('crypto');
const { body, param, query } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const llmService = require('../services/llmService');
const { checkLimit } = require('../lib/entitlements');
const { resolveCompanion } = require('../lib/aiCompanions');
const { cardMeta, applyVerdict, scoreSession } = require('../lib/therapyCards');
const { logInfo, logWarn, logError } = require('../lib/logger');
const {
  countTodayAiUsage,
  countTodayAiUsageByKind,
  resolveAiLimit,
  recordAiUsage,
} = require('../lib/aiUsage');
const { translationStatus } = require('../lib/translationStatus');
const { THERAPY_TOPIC_LIBRARY, isValidLibraryTopicId } = require('../lib/therapyTopicLibrary');
// Access checks, serializers and the notification fan-out live in lib/ so the
// closure router (and later Playbook / follow-up) can use them without
// requiring this router back. Re-exported at the bottom of this file — the
// dedicated-therapist endpoints import them from here.
const {
  getCoupleForUser,
  assertEventAccess,
  serializeEvent,
  serializeMessage,
  sendValidationError,
} = require('../lib/eventAccess');
const { notify } = require('../lib/eventNotify');
// 一起收尾. The closure router deliberately does NOT require this file back, so
// this single direction stays cycle-free.
const { enterClosing, sweepOverdueClosures } = require('./event-closure');

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

// ---------------------------------------------------------------------------
// Reusable read/write helpers — shared by the couple-member endpoints below and
// by the dedicated-therapist endpoints in routes/therapists.js. `privateVisibleTo`
// controls whose private events are visible: pass a member's userId to include
// their own private events, or null (e.g. a therapist) to exclude ALL private
// items. `viewerId` is used only to compute unread_count relative to the reader.
// ---------------------------------------------------------------------------

async function listEventsForCouple(
  coupleId,
  viewerId,
  { privateVisibleTo = null, status = 'all', tag, limit = 50, offset = 0 } = {}
) {
  // WHERE-clause params only reference columns; viewerId is used solely by the
  // unread_count subquery in the list query, so it is NOT part of the count
  // query (passing an unreferenced param makes Postgres reject the bind).
  const conds = ['e.couple_id = $1'];
  const whereParams = [coupleId];
  let i = 2;
  if (privateVisibleTo) {
    conds.push(`(e.is_private = FALSE OR e.created_by = $${i++})`);
    whereParams.push(privateVisibleTo);
  } else {
    conds.push('e.is_private = FALSE');
  }
  if (status && status !== 'all') {
    conds.push(`e.status = $${i++}`);
    whereParams.push(status);
  }
  if (tag) {
    conds.push(`$${i++} = ANY(e.tags)`);
    whereParams.push(tag);
  }
  const where = conds.join(' AND ');

  const countResult = await db.query(`SELECT COUNT(*) FROM events e WHERE ${where}`, whereParams);
  const total = parseInt(countResult.rows[0].count, 10);

  // List query appends viewerId (unread_count), then limit + offset.
  const listParams = [...whereParams];
  const viewerIdx = listParams.push(viewerId);
  const limitIdx = listParams.push(parseInt(limit, 10));
  const offsetIdx = listParams.push(parseInt(offset, 10));
  const listResult = await db.query(
    `SELECT e.*,
            (SELECT content FROM event_messages m WHERE m.event_id = e.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
            (SELECT COUNT(*) FROM event_messages m
               WHERE m.event_id = e.id AND m.sender_id <> $${viewerIdx} AND m.read_at IS NULL)::int AS unread_count,
            -- Whose turn is it? A 收尾中 row waiting on me looks identical to one
            -- waiting on my partner without this, which is the single biggest
            -- reason the ceremony stalls. Mirrors NOT_TERMINAL_EXISTS in
            -- routes/event-closure.js, scoped to the viewer: I still owe
            -- something if I haven't written, or if I've written and my partner
            -- has too but I haven't read theirs yet.
            (e.status = 'closing' AND EXISTS (
               SELECT 1 FROM event_closure_participants p
                WHERE p.event_id = e.id AND p.user_id = $${viewerIdx}
                  AND (
                    p.status = 'pending'
                    OR (p.status = 'submitted' AND p.reviewed_at IS NULL AND EXISTS (
                          SELECT 1 FROM event_closure_participants q
                           WHERE q.event_id = e.id AND q.user_id <> p.user_id
                             AND q.status = 'submitted'))
                  )
            )) AS closure_pending_me
     FROM events e
     WHERE ${where}
     ORDER BY e.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams
  );

  const events = listResult.rows.map((row) =>
    serializeEvent(row, {
      last_message_preview: row.last_message_preview,
      unread_count: row.unread_count || 0,
    })
  );
  return { events, total };
}

// One event (with full message log) scoped to a couple, applying the privacy
// rule. Returns a serialized event or null when it isn't visible to the viewer.
async function getEventDetailForCouple(eventId, coupleId, { privateVisibleTo = null } = {}) {
  const result = await db.query(
    `SELECT * FROM events WHERE id = $1 AND couple_id = $2`,
    [eventId, coupleId]
  );
  const event = result.rows[0];
  if (!event) return null;
  if (event.is_private && event.created_by !== privateVisibleTo) return null;

  const messagesResult = await db.query(
    `SELECT * FROM event_messages WHERE event_id = $1 ORDER BY created_at ASC`,
    [eventId]
  );
  return serializeEvent(event, { messages: messagesResult.rows.map(serializeMessage) });
}

// Insert a message and bump the event's updated_at. isTherapist flags a
// dedicated-therapist message so the UI can render it distinctly.
async function insertEventMessage(eventId, senderId, content, { isTherapist = false } = {}) {
  const msgResult = await db.query(
    `INSERT INTO event_messages (event_id, sender_id, content, is_therapist)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [eventId, senderId, content, isTherapist]
  );
  await db.query(`UPDATE events SET updated_at = NOW() WHERE id = $1`, [eventId]);
  return serializeMessage(msgResult.rows[0]);
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
          // Tone guideline (playbook R2): an invitation to understand, not an
          // incident report —「分享了一個情境」not「開啟了一個事件」.
          '伴侶分享了一個情境',
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
      res.status(500).json({ success: false, message: '建立對話失敗' });
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
         -- 'closing' counts as resolved here: reaching 收尾 IS resolving, and the
         -- rate shouldn't dip while a couple is mid-ceremony.
         SUM(CASE WHEN status IN ('resolved','closing') AND created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) AS resolved30,
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

// ---------------------------------------------------------------------------
// Therapy Mode summary ("諮商摘要") — the between-sessions digest a couple can
// bring INTO their next counseling session. Twogether is a Therapy Companion:
// the therapist gets ~1 hour, the couple lives the other 167 — this hands the
// therapist a ready summary so the session starts on the real issue.
// ---------------------------------------------------------------------------

async function ensureTherapySummariesTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS therapy_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
        period_days INTEGER NOT NULL,
        input_hash VARCHAR(64) NOT NULL,
        summary JSONB NOT NULL,
        event_count INTEGER,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (couple_id, input_hash)
      );
    `);
    // event_count added later so past summaries can list "共 N 件事件" in history.
    await db.query(
      `ALTER TABLE therapy_summaries ADD COLUMN IF NOT EXISTS event_count INTEGER`
    );
  } catch (err) {
    logWarn('ensureTherapySummariesTable failed', { err: err.message });
  }
}

function periodLabelFor(days) {
  return Number(days) === 14 ? '最近兩週' : `最近 ${days} 天`;
}

// GET /api/events/therapy-summary?days=14 — aggregate the couple's events over a
// window into a shared, cached 諮商摘要. Generated once per (couple, event-set);
// re-opens and the partner's view are free. Regenerates when events change.
router.get(
  '/therapy-summary',
  [query('days').optional().isInt({ min: 7, max: 30 }).toInt()],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const days = req.query.days || 14;
      const periodLabel = days === 14 ? '最近兩週' : `最近 ${days} 天`;

      const couple = await getCoupleForUser(userId);
      if (!couple) {
        // Solo users have no partner events to summarise — an expected state,
        // not a failure. Guide them to pairing (playbook: three-part gate).
        return res.status(200).json({
          success: false,
          error_code: 'NOT_PAIRED',
          message: '諮商摘要會整理你們兩人一起記錄的事件。先和另一半配對，累積幾件事後就能一鍵整理成帶去諮商的摘要。',
        });
      }
      const coupleId = couple.couple_id;

      const evResult = await db.query(
        `SELECT id, title, summary, status, tags, emotions,
                created_at, resolved_at, therapy_note, content_edited_at
           FROM events
          WHERE couple_id = $1
            AND is_private = FALSE
            AND created_at >= NOW() - ($2 || ' days')::interval
          ORDER BY created_at ASC`,
        [coupleId, String(days)]
      );
      const rows = evResult.rows;

      if (rows.length === 0) {
        // Empty window is expected (info), not an error — give a next step.
        return res.status(200).json({
          success: false,
          error_code: 'NO_EVENTS',
          message: `${periodLabel}還沒有可整理的事件。在「好好說話」記錄幾件最近發生的事，這裡就會幫你們整理成一份帶去諮商的摘要。`,
        });
      }

      // Deterministic aggregates — hand the model counts so it narrates, not tallies.
      const themeMap = new Map();
      const emotionMap = new Map();
      let repairedCount = 0;
      let unresolvedCount = 0;
      for (const r of rows) {
        (r.tags || []).forEach((t) => themeMap.set(t, (themeMap.get(t) || 0) + 1));
        (r.emotions || []).forEach((e) => emotionMap.set(e, (emotionMap.get(e) || 0) + 1));
        // 收尾中 counts as repaired — a therapist reading this summary shouldn't
        // be told a conflict is unresolved while the couple is writing their
        // commitments for it.
        if (r.status === 'resolved' || r.status === 'closing') repairedCount += 1;
        else unresolvedCount += 1;
      }
      const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
      const themeCounts = sortDesc(themeMap).map(([tag, count]) => ({ tag, count }));
      const emotionCounts = sortDesc(emotionMap).map(([emotion, count]) => ({ emotion, count }));
      const stats = { themeCounts, emotionCounts, repairedCount, unresolvedCount };

      // Cache key: the event set + each event's mutable markers + window. Any
      // change (new event, resolution, edited content, a new therapy note)
      // busts the cache so the summary stays fresh, but re-opens are free.
      const fingerprint = rows.map((r) => [
        r.id,
        r.status,
        r.content_edited_at ? new Date(r.content_edited_at).getTime() : 0,
        r.therapy_note ? 1 : 0,
      ]);
      const inputHash = aiCacheHash(['therapy_summary_v1', days, fingerprint]);

      await ensureTherapySummariesTable();
      const cached = await db.query(
        `SELECT summary FROM therapy_summaries WHERE couple_id = $1 AND input_hash = $2`,
        [coupleId, inputHash]
      );
      if (cached.rows[0]) {
        return res.json({
          success: true,
          summary: cached.rows[0].summary,
          period: { days, label: periodLabel, eventCount: rows.length },
          cached: true,
        });
      }

      // Fresh generation costs one AI credit (same budget as the therapy note).
      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('events.therapy_summary.limit', { userId, coupleId, used: usedToday, limit, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      logInfo('events.therapy_summary.generate', { userId, coupleId, days, eventCount: rows.length });

      const events = rows.map((r) => ({
        title: r.title,
        summary: r.summary,
        status: r.status,
        tags: r.tags || [],
        emotions: r.emotions || [],
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        therapyNote: r.therapy_note || null,
      }));

      const result = await llmService.generateTherapySummary({ periodLabel, events, stats });
      const meta = result._meta;
      delete result._meta;

      logInfo('events.therapy_summary.cost', {
        userId,
        coupleId,
        provider: meta?.provider,
        model: meta?.model,
        costUsd: meta?.costUsd,
        durationMs: meta?.durationMs,
      });

      await recordAiUsage(userId, 'therapy_summary', `${periodLabel}・${rows.length} 件`, meta);
      // Upsert so a racing partner request collapses onto the same row.
      await db.query(
        `INSERT INTO therapy_summaries (couple_id, period_days, input_hash, summary, event_count)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (couple_id, input_hash)
           DO UPDATE SET summary = EXCLUDED.summary, event_count = EXCLUDED.event_count`,
        [coupleId, days, inputHash, JSON.stringify(result), rows.length]
      );

      res.json({
        success: true,
        summary: result,
        period: { days, label: periodLabel, eventCount: rows.length },
      });
    } catch (err) {
      logError('Therapy summary failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '諮商摘要暫時無法產生，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// 溝通模式 (communication pattern) — the cross-conflict "third party" lens
// ---------------------------------------------------------------------------
// A single conflict gets its own therapy note; this zooms out across several
// resolved events to name the ONE recurring loop the couple keeps falling into,
// gently flag the rational wrapping that hides sarcasm, and offer one small
// exit practice. This is the "模式" design principle. On-demand (costs one AI
// credit) and cached per (couple, resolved-event-set) so re-opens are free.

// Enough resolved conflicts (with a per-event cycle) to see a *pattern*, not
// just one fight. Below this, the empty state guides them to keep going.
const COMMUNICATION_PATTERN_MIN_EVENTS = 2;

async function ensureCommunicationPatternsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS communication_pattern_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
        input_hash VARCHAR(64) NOT NULL,
        summary JSONB NOT NULL,
        event_count INTEGER,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (couple_id, input_hash)
      );
    `);
  } catch (err) {
    logWarn('ensureCommunicationPatternsTable failed', { err: err.message });
  }
}

// GET /api/events/communication-pattern — the couple's recurring 溝通模式 across
// their recent resolved conflicts. Shared + cached; regenerates when the set of
// resolved events (or their therapy notes) changes.
router.get('/communication-pattern', async (req, res) => {
  try {
    const userId = req.user.id;

    const couple = await getCoupleForUser(userId);
    if (!couple) {
      // Solo users have no shared conflict history yet — expected, not an error.
      return res.status(200).json({
        success: false,
        error_code: 'NOT_PAIRED',
        message: '溝通模式會從你們一起說開的幾件事裡，看出反覆出現的循環。先和另一半配對，累積幾次之後就能一起看見。',
      });
    }
    const coupleId = couple.couple_id;

    // Only finished (resolved or 收尾中), non-private events that actually
    // produced a therapy note — which carries the per-event cycle we aggregate
    // over. The note now exists during 'closing', so include it.
    const evResult = await db.query(
      `SELECT id, title, tags, toxicity_flags, therapy_note, content_edited_at, resolved_at
         FROM events
        WHERE couple_id = $1
          AND is_private = FALSE
          AND status IN ('resolved','closing')
          AND therapy_note IS NOT NULL
        ORDER BY resolved_at DESC NULLS LAST
        LIMIT 12`,
      [coupleId]
    );
    const rows = evResult.rows;

    if (rows.length < COMMUNICATION_PATTERN_MIN_EVENTS) {
      // Not enough history to see a pattern yet — an expected state with a next
      // step (playbook: empty states are mini-onboarding, not a full stop).
      return res.status(200).json({
        success: false,
        error_code: 'NOT_ENOUGH_EVENTS',
        message: `再多說開幾件事，就能看見你們的溝通模式了。目前已完成 ${rows.length} 件，累積 ${COMMUNICATION_PATTERN_MIN_EVENTS} 件（已標記解決、有治療摘要）後就會出現。`,
        progress: { have: rows.length, need: COMMUNICATION_PATTERN_MIN_EVENTS },
      });
    }

    // Deterministic aggregates — hand the model counts so it narrates, not tallies.
    const stepMap = new Map();
    const flagMap = new Map();
    const themeMap = new Map();
    for (const r of rows) {
      const note = r.therapy_note || {};
      (Array.isArray(note.cycle) ? note.cycle : []).forEach((s) => {
        const k = (s || '').toString().trim();
        if (k) stepMap.set(k, (stepMap.get(k) || 0) + 1);
      });
      (r.toxicity_flags || []).forEach((f) => flagMap.set(f, (flagMap.get(f) || 0) + 1));
      (r.tags || []).forEach((t) => themeMap.set(t, (themeMap.get(t) || 0) + 1));
    }
    const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    const stats = {
      cycleStepCounts: sortDesc(stepMap).map(([step, count]) => ({ step, count })),
      toxicityCounts: sortDesc(flagMap).map(([flag, count]) => ({ flag, count })),
      themeCounts: sortDesc(themeMap).map(([tag, count]) => ({ tag, count })),
    };

    // Cache key: the resolved-event set + each note's mutability markers. Any
    // new resolved event or edited content busts it; re-opens are free.
    const fingerprint = rows.map((r) => [
      r.id,
      r.content_edited_at ? new Date(r.content_edited_at).getTime() : 0,
      r.therapy_note ? 1 : 0,
    ]);
    const inputHash = aiCacheHash(['communication_pattern_v1', fingerprint]);

    await ensureCommunicationPatternsTable();
    const cached = await db.query(
      `SELECT summary FROM communication_pattern_summaries WHERE couple_id = $1 AND input_hash = $2`,
      [coupleId, inputHash]
    );
    if (cached.rows[0]) {
      return res.json({
        success: true,
        pattern: cached.rows[0].summary,
        eventCount: rows.length,
        cached: true,
      });
    }

    // Fresh generation costs one AI credit (same daily budget as the icebreaker).
    const { tier, limit } = await resolveAiLimit(userId);
    const usedToday = await countTodayAiUsage(userId);
    const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
    if (!limitCheck.ok) {
      logInfo('events.communication_pattern.limit', { userId, coupleId, used: usedToday, limit, tier, blocked: true });
      return res.status(limitCheck.status).json(limitCheck.body);
    }

    logInfo('events.communication_pattern.generate', { userId, coupleId, eventCount: rows.length });

    const events = rows.map((r) => {
      const note = r.therapy_note || {};
      return {
        title: r.title,
        trigger: note.trigger || '',
        needs: Array.isArray(note.needs) ? note.needs : [],
        cycle: Array.isArray(note.cycle) ? note.cycle : [],
        toxicityFlags: r.toxicity_flags || [],
        tags: r.tags || [],
      };
    });

    const result = await llmService.generateCommunicationPatternSummary({ events, stats });
    const meta = result._meta;
    delete result._meta;

    logInfo('events.communication_pattern.cost', {
      userId,
      coupleId,
      provider: meta?.provider,
      model: meta?.model,
      costUsd: meta?.costUsd,
      durationMs: meta?.durationMs,
    });

    await recordAiUsage(userId, 'communication_pattern', `${rows.length} 件已解決事件`, meta);
    await db.query(
      `INSERT INTO communication_pattern_summaries (couple_id, input_hash, summary, event_count)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (couple_id, input_hash)
         DO UPDATE SET summary = EXCLUDED.summary, event_count = EXCLUDED.event_count`,
      [coupleId, inputHash, JSON.stringify(result), rows.length]
    );

    res.json({ success: true, pattern: result, eventCount: rows.length });
  } catch (err) {
    logError('Communication pattern failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '溝通模式暫時無法產生，請稍後再試' });
  }
});

// GET /api/events/therapy-summary/history — the couple's previously generated
// 諮商摘要 snapshots, newest first. Every distinct event-set produced a cached
// row (see the generate route); this exposes them so either partner can re-open
// an earlier summary — the one they took to a past session — without spending an
// AI credit to regenerate the same thing.
router.get('/therapy-summary/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await getCoupleForUser(userId);
    if (!couple) {
      // Not an error: solo users simply have no shared history yet.
      return res.json({ success: true, history: [] });
    }

    await ensureTherapySummariesTable();
    const result = await db.query(
      `SELECT id, period_days, event_count, summary, created_at
         FROM therapy_summaries
        WHERE couple_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [couple.couple_id]
    );

    const history = result.rows.map((r) => ({
      id: r.id,
      periodDays: r.period_days,
      periodLabel: periodLabelFor(r.period_days),
      eventCount: r.event_count,
      createdAt: r.created_at,
      summary: r.summary,
    }));

    res.json({ success: true, history });
  } catch (err) {
    logError('Therapy summary history failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法載入諮商摘要紀錄，請稍後再試' });
  }
});

// ---------------------------------------------------------------------------
// Therapy Topics ("話題建議") — proactive discussion topics for the couple's
// NEXT session, generated from recent events. Unlike 諮商摘要 above (which
// organizes what already happened), this looks forward — and deliberately
// never goes empty: "no conflict" is not "no relationship problem". A couple
// with a quiet couple of weeks still gets 3-5 grounded topics, just framed
// with a reassuring tone and drawn from older unresolved events or general
// relationship-maintenance angles instead of manufactured conflict.
// ---------------------------------------------------------------------------

// Below this many recent events, "recent conflict" isn't really the picture —
// widen the lookback and switch to quiet framing instead of thin results.
const QUIET_EVENT_THRESHOLD = 3;
const QUIET_WIDEN_DAYS = 60;

async function ensureTherapyTopicSuggestionsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS therapy_topic_suggestions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
        period_days INTEGER NOT NULL,
        applied_days INTEGER NOT NULL,
        quiet BOOLEAN NOT NULL DEFAULT FALSE,
        input_hash VARCHAR(64) NOT NULL,
        topics JSONB NOT NULL,
        event_count INTEGER,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (couple_id, input_hash)
      );
    `);
  } catch (err) {
    logWarn('ensureTherapyTopicSuggestionsTable failed', { err: err.message });
  }
}

async function ensureTherapyTopicSelectionsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS therapy_topic_selections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
        input_hash VARCHAR(64) NOT NULL,
        topic_index INTEGER NOT NULL,
        status VARCHAR(16) CHECK (status IS NULL OR status IN ('selected', 'saved', 'dismissed')),
        notes TEXT,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (couple_id, input_hash, topic_index),
        FOREIGN KEY (couple_id, input_hash)
          REFERENCES therapy_topic_suggestions (couple_id, input_hash) ON DELETE CASCADE
      );
    `);
  } catch (err) {
    logWarn('ensureTherapyTopicSelectionsTable failed', { err: err.message });
  }
}

async function ensureTherapyTopicLibrarySelectionsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS therapy_topic_library_selections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
        topic_id VARCHAR(64) NOT NULL,
        status VARCHAR(16) CHECK (status IS NULL OR status IN ('selected', 'saved', 'dismissed')),
        notes TEXT,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (couple_id, topic_id)
      );
    `);
  } catch (err) {
    logWarn('ensureTherapyTopicLibrarySelectionsTable failed', { err: err.message });
  }
}

// selections rows -> { [topicIndex]: {status, notes, updatedAt} } (or keyed by topic_id for the library)
function selectionsByKey(rows, keyField) {
  const map = {};
  for (const r of rows) {
    map[r[keyField]] = {
      status: r.status || null,
      notes: r.notes || null,
      updatedAt: r.updated_at,
    };
  }
  return map;
}

// GET /api/events/therapy-topics?days=14 — 3-5 AI-suggested discussion topics
// for the couple's next session. Cached per (couple, input event-set); a
// re-open (or the partner's view) is free. Deliberately has NO "no events"
// guard — see the quiet-widen fallback below.
router.get(
  '/therapy-topics',
  [query('days').optional().isInt({ min: 7, max: 30 }).toInt()],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const days = req.query.days || 14;
      const periodLabel = periodLabelFor(days);

      const couple = await getCoupleForUser(userId);
      if (!couple) {
        return res.status(200).json({
          success: false,
          error_code: 'NOT_PAIRED',
          message: '話題建議會從你們最近記錄的事件裡，主動整理出下次諮商可以聊的方向。先和另一半配對，就能開始收到建議。',
        });
      }
      const coupleId = couple.couple_id;

      const primary = await db.query(
        `SELECT id, title, summary, status, tags, emotions,
                created_at, resolved_at, therapy_note, content_edited_at
           FROM events
          WHERE couple_id = $1
            AND is_private = FALSE
            AND created_at >= NOW() - ($2 || ' days')::interval
          ORDER BY created_at ASC`,
        [coupleId, String(days)]
      );
      let rows = primary.rows;
      const primaryCount = primary.rows.length;
      let appliedDays = days;

      // Widen the lookback when recent activity is thin so the model has real
      // material to ground topics in, rather than returning a sparse result.
      // But `quiet` — the "最近很平靜" reassurance framing — is reserved for a
      // genuinely empty recent window: with 1-2 real recent conflicts we still
      // widen for context, yet must NOT tell the couple things have been calm.
      if (primaryCount < QUIET_EVENT_THRESHOLD) {
        const widened = await db.query(
          `SELECT id, title, summary, status, tags, emotions,
                  created_at, resolved_at, therapy_note, content_edited_at
             FROM events
            WHERE couple_id = $1
              AND is_private = FALSE
              AND created_at < NOW() - ($2 || ' days')::interval
              AND created_at >= NOW() - ($3 || ' days')::interval
              AND status IN ('open', 'resolve_pending', 'closing')
            ORDER BY created_at DESC
            LIMIT 10`,
          [coupleId, String(days), String(QUIET_WIDEN_DAYS)]
        );
        rows = rows.concat(widened.rows);
        appliedDays = QUIET_WIDEN_DAYS;
      }
      const quiet = primaryCount === 0;
      // Primary rows are ASC and any widened rows were fetched DESC — sort the
      // combined set oldest-first so it matches the "最舊在前" prompt label and
      // gives a stable, deterministic order for the cache fingerprint.
      rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      // Deterministic aggregates — hand the model counts so it narrates, not tallies.
      const themeMap = new Map();
      const emotionMap = new Map();
      let resolvedCount = 0;
      let unresolvedCount = 0;
      for (const r of rows) {
        (r.tags || []).forEach((t) => themeMap.set(t, (themeMap.get(t) || 0) + 1));
        (r.emotions || []).forEach((e) => emotionMap.set(e, (emotionMap.get(e) || 0) + 1));
        if (r.status === 'resolved' || r.status === 'closing') resolvedCount += 1;
        else unresolvedCount += 1;
      }
      const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
      const themeCounts = sortDesc(themeMap).map(([tag, count]) => ({ tag, count }));
      const emotionCounts = sortDesc(emotionMap).map(([emotion, count]) => ({ emotion, count }));
      const daysSinceLastEvent = rows.length
        ? Math.floor((Date.now() - new Date(rows.reduce((latest, r) => (new Date(r.created_at) > new Date(latest.created_at) ? r : latest)).created_at).getTime()) / 86400000)
        : null;
      const stats = { themeCounts, emotionCounts, resolvedCount, unresolvedCount, daysSinceLastEvent };

      // Cache key includes `quiet` so crossing the threshold always busts the
      // cache even when appliedDays coincidentally matches.
      const fingerprint = rows.map((r) => [
        r.id,
        r.status,
        r.content_edited_at ? new Date(r.content_edited_at).getTime() : 0,
        r.therapy_note ? 1 : 0,
      ]);
      const inputHash = aiCacheHash(['therapy_topics_v1', appliedDays, quiet, fingerprint]);

      await ensureTherapyTopicSuggestionsTable();
      await ensureTherapyTopicSelectionsTable();
      const cached = await db.query(
        `SELECT topics FROM therapy_topic_suggestions WHERE couple_id = $1 AND input_hash = $2`,
        [coupleId, inputHash]
      );
      if (cached.rows[0]) {
        const sel = await db.query(
          `SELECT topic_index, status, notes, updated_at FROM therapy_topic_selections
            WHERE couple_id = $1 AND input_hash = $2`,
          [coupleId, inputHash]
        );
        return res.json({
          success: true,
          inputHash,
          topics: cached.rows[0].topics,
          period: { days, appliedDays, label: periodLabel, eventCount: rows.length, quiet },
          selections: selectionsByKey(sel.rows, 'topic_index'),
          cached: true,
        });
      }

      // Fresh generation costs one AI credit (same shared daily budget as every
      // other AI feature).
      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('events.therapy_topics.limit', { userId, coupleId, used: usedToday, limit, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      logInfo('events.therapy_topics.generate', { userId, coupleId, days, appliedDays, quiet, eventCount: rows.length });

      const events = rows.map((r) => ({
        title: r.title,
        summary: r.summary,
        status: r.status,
        tags: r.tags || [],
        emotions: r.emotions || [],
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
      }));

      const result = await llmService.generateTherapyTopics({ periodLabel, appliedDays, events, stats, quiet });
      const meta = result._meta;
      delete result._meta;

      logInfo('events.therapy_topics.cost', {
        userId,
        coupleId,
        provider: meta?.provider,
        model: meta?.model,
        costUsd: meta?.costUsd,
        durationMs: meta?.durationMs,
      });

      await recordAiUsage(userId, 'therapy_topics', `${periodLabel}・${quiet ? '平靜模式・' : ''}${rows.length} 件`, meta);
      await db.query(
        `INSERT INTO therapy_topic_suggestions (couple_id, period_days, applied_days, quiet, input_hash, topics, event_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (couple_id, input_hash)
           DO UPDATE SET topics = EXCLUDED.topics, event_count = EXCLUDED.event_count`,
        [coupleId, days, appliedDays, quiet, inputHash, JSON.stringify(result), rows.length]
      );

      res.json({
        success: true,
        inputHash,
        topics: result,
        period: { days, appliedDays, label: periodLabel, eventCount: rows.length, quiet },
        selections: {},
      });
    } catch (err) {
      logError('Therapy topics failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '話題建議暫時無法產生，請稍後再試' });
    }
  }
);

// PUT /api/events/therapy-topics/:inputHash/selections/:topicIndex — mark a
// suggested topic 加入諮商/先收藏/不相關 and/or jot free-text notes. Either
// field alone may be sent (e.g. typing notes without changing the pick); the
// field NOT present is carried forward. `status: null` is a deliberate clear
// (un-tapping the pick) and is distinct from omitting status — the `hasStatus`
// flag drives a CASE so a clear actually writes null instead of being kept.
// No AI quota involved.
router.put(
  '/therapy-topics/:inputHash/selections/:topicIndex',
  [
    param('inputHash').isLength({ min: 64, max: 64 }).isHexadecimal(),
    param('topicIndex').isInt({ min: 0, max: 9 }).toInt(),
    body('status').optional({ nullable: true }).isIn(['selected', 'saved', 'dismissed']),
    body('notes').optional().isString().isLength({ max: 500 }).withMessage('筆記需在 500 字以內'),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const { inputHash, topicIndex } = req.params;
      const hasStatus = Object.prototype.hasOwnProperty.call(req.body, 'status');
      const hasNotes = Object.prototype.hasOwnProperty.call(req.body, 'notes');
      if (!hasStatus && !hasNotes) {
        return res.status(400).json({ success: false, message: '請提供 status 或 notes 其中之一' });
      }

      const couple = await getCoupleForUser(userId);
      if (!couple) {
        return res.status(404).json({ success: false, message: '找不到這批話題建議' });
      }
      const coupleId = couple.couple_id;

      await ensureTherapyTopicSuggestionsTable();
      const suggestion = await db.query(
        `SELECT topics FROM therapy_topic_suggestions WHERE couple_id = $1 AND input_hash = $2`,
        [coupleId, inputHash]
      );
      if (!suggestion.rows[0]) {
        return res.status(404).json({ success: false, message: '找不到這批話題建議' });
      }
      const topicCount = Array.isArray(suggestion.rows[0].topics?.topics) ? suggestion.rows[0].topics.topics.length : 0;
      if (topicIndex >= topicCount) {
        return res.status(400).json({ success: false, message: '找不到這個話題' });
      }

      await ensureTherapyTopicSelectionsTable();
      const statusParam = hasStatus ? (req.body.status ?? null) : null;
      const notesParam = hasNotes ? req.body.notes.toString().trim() : null;
      const result = await db.query(
        // $7/$8 = "this field is being set" flags. When true we write the value
        // directly (so an explicit null clears it); when false we keep the
        // existing value. COALESCE alone can't express a deliberate clear.
        `INSERT INTO therapy_topic_selections (couple_id, input_hash, topic_index, status, notes, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (couple_id, input_hash, topic_index) DO UPDATE
           SET status = CASE WHEN $7::boolean THEN $4 ELSE therapy_topic_selections.status END,
               notes = CASE WHEN $8::boolean THEN $5 ELSE therapy_topic_selections.notes END,
               updated_by = $6,
               updated_at = NOW()
         RETURNING status, notes, updated_at`,
        [coupleId, inputHash, topicIndex, statusParam, notesParam, userId, hasStatus, hasNotes]
      );
      const row = result.rows[0];
      res.json({ success: true, selection: { topicIndex, status: row.status, notes: row.notes, updatedAt: row.updated_at } });
    } catch (err) {
      logError('Therapy topic selection failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '更新失敗，請稍後再試' });
    }
  }
);

// GET /api/events/therapy-topics/library — the static Topic Library (話題庫):
// curated relationship-maintenance topics, always available with no AI cost.
// Merges in the caller's own selections (when paired) in one round trip.
router.get('/therapy-topics/library', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await getCoupleForUser(userId);
    let selections = {};
    if (couple) {
      await ensureTherapyTopicLibrarySelectionsTable();
      const sel = await db.query(
        `SELECT topic_id, status, notes, updated_at FROM therapy_topic_library_selections WHERE couple_id = $1`,
        [couple.couple_id]
      );
      selections = selectionsByKey(sel.rows, 'topic_id');
    }
    res.json({ success: true, library: THERAPY_TOPIC_LIBRARY, selections });
  } catch (err) {
    logError('Therapy topic library failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法載入話題庫，請稍後再試' });
  }
});

// PUT /api/events/therapy-topics/library/:topicId/selection — same pick/notes
// semantics as the AI-generated endpoint above, for a static library topic.
router.put(
  '/therapy-topics/library/:topicId/selection',
  [
    body('status').optional({ nullable: true }).isIn(['selected', 'saved', 'dismissed']),
    body('notes').optional().isString().isLength({ max: 500 }).withMessage('筆記需在 500 字以內'),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const userId = req.user.id;
      const { topicId } = req.params;
      if (!isValidLibraryTopicId(topicId)) {
        return res.status(400).json({ success: false, message: '找不到這個話題' });
      }
      const hasStatus = Object.prototype.hasOwnProperty.call(req.body, 'status');
      const hasNotes = Object.prototype.hasOwnProperty.call(req.body, 'notes');
      if (!hasStatus && !hasNotes) {
        return res.status(400).json({ success: false, message: '請提供 status 或 notes 其中之一' });
      }

      const couple = await getCoupleForUser(userId);
      if (!couple) {
        return res.status(400).json({ success: false, error_code: 'NOT_PAIRED', message: '請先和另一半配對，才能標記話題庫的話題' });
      }

      await ensureTherapyTopicLibrarySelectionsTable();
      const statusParam = hasStatus ? (req.body.status ?? null) : null;
      const notesParam = hasNotes ? req.body.notes.toString().trim() : null;
      const result = await db.query(
        // $6/$7 = "field is being set" flags — see the AI-topic endpoint above.
        // Lets an explicit `status: null` clear the pick instead of COALESCE
        // silently keeping the old value.
        `INSERT INTO therapy_topic_library_selections (couple_id, topic_id, status, notes, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (couple_id, topic_id) DO UPDATE
           SET status = CASE WHEN $6::boolean THEN $3 ELSE therapy_topic_library_selections.status END,
               notes = CASE WHEN $7::boolean THEN $4 ELSE therapy_topic_library_selections.notes END,
               updated_by = $5,
               updated_at = NOW()
         RETURNING status, notes, updated_at`,
        [couple.couple_id, topicId, statusParam, notesParam, userId, hasStatus, hasNotes]
      );
      const row = result.rows[0];
      res.json({ success: true, selection: { topicId, status: row.status, notes: row.notes, updatedAt: row.updated_at } });
    } catch (err) {
      logError('Therapy topic library selection failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '更新失敗，請稍後再試' });
    }
  }
);

// GET /api/events/therapy-topics/history — the couple's previously generated
// 話題建議 snapshots, newest first. Free to re-open. Library picks aren't part
// of this list — they're not per-generation, they always reflect current
// state via GET /therapy-topics/library above.
router.get('/therapy-topics/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const couple = await getCoupleForUser(userId);
    if (!couple) {
      return res.json({ success: true, history: [] });
    }

    await ensureTherapyTopicSuggestionsTable();
    const result = await db.query(
      `SELECT id, input_hash, period_days, applied_days, quiet, event_count, topics, created_at
         FROM therapy_topic_suggestions
        WHERE couple_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [couple.couple_id]
    );

    let selectionsByHash = {};
    if (result.rows.length) {
      await ensureTherapyTopicSelectionsTable();
      const hashes = result.rows.map((r) => r.input_hash);
      const sel = await db.query(
        `SELECT input_hash, topic_index, status, notes, updated_at
           FROM therapy_topic_selections
          WHERE couple_id = $1 AND input_hash = ANY($2)`,
        [couple.couple_id, hashes]
      );
      for (const r of sel.rows) {
        if (!selectionsByHash[r.input_hash]) selectionsByHash[r.input_hash] = {};
        selectionsByHash[r.input_hash][r.topic_index] = { status: r.status || null, notes: r.notes || null, updatedAt: r.updated_at };
      }
    }

    const history = result.rows.map((r) => ({
      id: r.id,
      inputHash: r.input_hash,
      periodDays: r.period_days,
      appliedDays: r.applied_days,
      periodLabel: periodLabelFor(r.period_days),
      quiet: r.quiet === true,
      eventCount: r.event_count,
      createdAt: r.created_at,
      topics: r.topics,
      selections: selectionsByHash[r.input_hash] || {},
    }));

    res.json({ success: true, history });
  } catch (err) {
    logError('Therapy topics history failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法載入話題建議紀錄，請稍後再試' });
  }
});

// The topic set the therapist should see + its selections, plus the static
// library + the couple's library selections — for the dedicated-therapist
// read-only view (routes/therapists.js). Never triggers generation.
//
// Selections are keyed by input_hash, so a fresh generation (new event set →
// new hash) would otherwise orphan the picks/notes the couple made on an
// earlier set and show the therapist an un-annotated board. To keep the
// changelog's promise ("心理師也看得到這些建議與筆記"), prefer the most
// recent generation the couple actually ENGAGED with (has ≥1 selection),
// falling back to the newest generation when none is annotated yet.
async function getLatestTherapyTopicsForCouple(coupleId) {
  await ensureTherapyTopicSuggestionsTable();
  await ensureTherapyTopicSelectionsTable();
  const latest = await db.query(
    `SELECT s.input_hash, s.period_days, s.applied_days, s.quiet, s.event_count, s.topics, s.created_at
       FROM therapy_topic_suggestions s
       LEFT JOIN LATERAL (
         SELECT 1 FROM therapy_topic_selections sel
          WHERE sel.couple_id = s.couple_id AND sel.input_hash = s.input_hash
          LIMIT 1
       ) has_sel ON true
      WHERE s.couple_id = $1
      ORDER BY (has_sel IS NOT NULL) DESC, s.created_at DESC
      LIMIT 1`,
    [coupleId]
  );
  const row = latest.rows[0] || null;

  let selections = {};
  if (row) {
    const sel = await db.query(
      `SELECT topic_index, status, notes, updated_at FROM therapy_topic_selections
        WHERE couple_id = $1 AND input_hash = $2`,
      [coupleId, row.input_hash]
    );
    selections = selectionsByKey(sel.rows, 'topic_index');
  }

  await ensureTherapyTopicLibrarySelectionsTable();
  const librarySel = await db.query(
    `SELECT topic_id, status, notes, updated_at FROM therapy_topic_library_selections WHERE couple_id = $1`,
    [coupleId]
  );

  return {
    topics: row?.topics || null,
    period: row
      ? { days: row.period_days, appliedDays: row.applied_days, label: periodLabelFor(row.period_days), eventCount: row.event_count, quiet: row.quiet === true }
      : null,
    selections,
    generatedAt: row?.created_at || null,
    library: THERAPY_TOPIC_LIBRARY,
    librarySelections: selectionsByKey(librarySel.rows, 'topic_id'),
  };
}

// List events for caller's couple
router.get(
  '/',
  [
    query('status').optional().isIn(['open', 'resolve_pending', 'closing', 'resolved', 'all']),
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

      const { events, total } = await listEventsForCouple(couple.couple_id, userId, {
        privateVisibleTo: userId,
        status,
        tag,
        limit,
        offset,
      });

      res.json({ success: true, events, total });

      // Lazy 72h auto-finalize sweep, fire-and-forget AFTER responding — there
      // is no cron in this app, so it rides the endpoint everyone hits when
      // they open 好好說話 (same pattern as the relationship reminders). Without
      // it a closure whose second partner never returns strands the event in
      // 'closing' and silently corrupts every resolved count.
      sweepOverdueClosures();
    } catch (err) {
      logError('List events failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '無法取得對話列表' });
    }
  }
);

// Event detail with full message log
router.get('/:id', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });

    const event = await getEventDetailForCouple(req.params.id, access.coupleId, {
      privateVisibleTo: req.user.id,
    });
    if (!event) {
      return res.status(403).json({ success: false, message: '此為私人對話' });
    }

    res.json({ success: true, event });
  } catch (err) {
    logError('Get event failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法取得對話詳情' });
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
      if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      if (access.event.created_by !== userId) {
        return res.status(403).json({
          success: false,
          message: '只有發起人可以編輯對話內容',
          error_code: 'NOT_EVENT_CREATOR',
        });
      }
      // Also blocked during 收尾: your partner is writing a commitment based on
      // what this event says, so the premise can't shift under them.
      if (access.event.status === 'resolved' || access.event.status === 'closing') {
        return res.status(400).json({
          success: false,
          message: access.event.status === 'closing'
            ? '你們正在收尾，先一起完成約定。想改內容可以重新開啟討論。'
            : '這段對話已完成，無法編輯',
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
      res.status(500).json({ success: false, message: '編輯對話失敗，請稍後再試' });
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
      if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({
          success: false,
          message: '私人對話無法編輯訊息',
          error_code: 'PRIVATE_EVENT',
        });
      }
      if (access.event.status === 'resolved' || access.event.status === 'closing') {
        return res.status(400).json({
          success: false,
          message: access.event.status === 'closing'
            ? '你們正在收尾，先一起完成約定。想改訊息可以重新開啟討論。'
            : '這段對話已完成，無法編輯訊息',
          error_code: access.event.status === 'closing' ? 'EVENT_CLOSING' : 'EVENT_RESOLVED',
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
  [
    param('id').isUUID(),
    body('content').isString().isLength({ min: 1, max: 2000 })
      .withMessage('訊息需在 1–2000 字之間，請刪減後再送出，或分成兩則送出'),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人對話無法新增訊息' });
      }
      if (access.event.status === 'resolved') {
        return res.status(400).json({ success: false, message: '這段對話已完成，無法新增訊息' });
      }

      const message = await insertEventMessage(req.params.id, req.user.id, req.body.content);

      await notify(
        access.partnerId,
        'event_reply',
        '伴侶回覆了你們的對話',
        access.event.title,
        req.params.id,
        req.user.id,
        2,
        req.body.content
      );

      res.status(201).json({ success: true, message });
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
      if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人對話不支援 AI 回覆改寫' });
      }

      const userId = req.user.id;
      const rawReply = req.body.rawReply;
      logInfo('events.reply_rewrite.input', { userId, eventId: req.params.id, len: rawReply.length, raw: rawReply });

      // Shares the daily AI budget with the icebreaker (both hit the paid LLM).
      const { tier, limit, coupleId } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        // Include the per-kind breakdown so a block can be attributed to the
        // right feature (改寫 vs 角色扮演 vs 諮商師…) directly from the logs.
        const { byKind } = await countTodayAiUsageByKind(userId);
        logInfo('events.reply_rewrite.limit', { userId, coupleId, used: usedToday, limit, tier, byKind, blocked: true });
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
      // A draft too long to rewrite inside one response is an expected state
      // with a next step, not an outage — keep its specific reason and code so
      // the UI can tell the user what to do instead of "AI 改寫失敗".
      if (err.error_code === 'REWRITE_TOO_LONG') {
        logWarn('events.reply_rewrite.too_long', {
          userId: req.user.id, eventId: req.params.id, draftChars: (req.body.rawReply || '').length,
        });
        return res.status(422).json({ success: false, message: err.message, error_code: err.error_code });
      }
      logError('Reply rewrite preview failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: 'AI 改寫失敗，請稍後再試' });
    }
  }
);

// Per-message emotion meter ("即時情緒檢測"): analyze a reply draft BEFORE it is
// sent — the layered emotions, how the partner may mishear it vs the real worry
// underneath, the need, and a rewrite. Stateless (no message is created).
// Cached per (event, user, draft) so re-checking the same draft is free.
router.post(
  '/:id/messages/analyze-draft',
  [
    param('id').isUUID(),
    body('draft').isString().isLength({ min: 1, max: 2000 }).withMessage('內容需在 1–2000 字之間'),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到事件或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人事件不支援情緒檢測', error_code: 'PRIVATE_EVENT' });
      }

      const userId = req.user.id;
      const draft = req.body.draft;

      const recent = await db.query(
        `SELECT sender_id, content FROM event_messages
          WHERE event_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [req.params.id]
      );
      const recentMessages = recent.rows.reverse().map((m) => ({
        fromSelf: m.sender_id === userId,
        content: m.content,
      }));
      const genders = await getCoupleGenders(userId);

      // Cache first: same draft + same thread → reuse for free (no budget hit).
      const inputHash = aiCacheHash(['draft_analysis_v1', access.event.summary, recentMessages, draft, genders]);
      const cached = await getAiCache(req.params.id, userId, 'draft_analysis', inputHash);
      if (cached) {
        return res.json({ success: true, analysis: cached, cached: true });
      }

      const { tier, limit } = await resolveAiLimit(userId);
      const usedToday = await countTodayAiUsage(userId);
      const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
      if (!limitCheck.ok) {
        logInfo('events.draft_analysis.limit', { userId, eventId: req.params.id, used: usedToday, limit, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }

      const analysis = await llmService.analyzeDraft({
        draft,
        eventSummary: access.event.summary,
        recentMessages,
        ...genders,
      });
      const meta = analysis._meta;
      delete analysis._meta;

      logInfo('events.draft_analysis.cost', {
        userId,
        eventId: req.params.id,
        provider: meta?.provider,
        model: meta?.model,
        costUsd: meta?.costUsd,
        durationMs: meta?.durationMs,
      });

      await recordAiUsage(userId, 'draft_analysis', draft, meta);
      await saveAiCache(req.params.id, userId, 'draft_analysis', inputHash, analysis);

      res.json({ success: true, analysis });
    } catch (err) {
      logError('Draft analysis failed', { err: err.message, stack: err.stack, eventId: req.params.id });
      res.status(500).json({ success: false, message: '情緒檢測暫時無法產生，請稍後再試' });
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
      if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人對話不支援 AI 接住情緒建議' });
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
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
    if (access.event.is_private) {
      return res.status(403).json({ success: false, message: '私人對話無法邀請 AI 諮商師' });
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
  [
    param('id').isUUID(),
    body('content').isString().isLength({ min: 1, max: 2000 })
      .withMessage('訊息需在 1–2000 字之間，請刪減後再送出，或分成兩則送出'),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人對話無法新增訊息' });
      }
      if (access.event.status === 'resolved') {
        return res.status(400).json({ success: false, message: '這段對話已完成，無法新增訊息' });
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
        `AI 諮商師 ${companion.name} 在對話中留言`,
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
      if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      if (access.event.is_private) {
        return res.status(403).json({ success: false, message: '私人對話無法開啟情緒翻譯', error_code: 'PRIVATE_EVENT' });
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
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
    if (access.event.is_private) {
      return res.status(403).json({ success: false, message: '私人對話無法使用情緒翻譯', error_code: 'PRIVATE_EVENT' });
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
    // Reported back so the client can tell "nothing to do" apart from "asked
    // for 5, got 0" — the latter must never render as silence.
    let requested = 0;
    let translated = 0;
    logInfo('events.translation.request', {
      userId,
      eventId: req.params.id,
      humanMessages: humanIds.length,
      cached: cachedRows.length,
      missing: missing.length,
    });

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

      let saved = 0;
      const unmatched = [];
      for (const t of result.translations || []) {
        if (!missing.includes(t.id)) { unmatched.push(t.id); continue; }
        const payload = { emotions: t.emotions || [], need: t.need || '', rewrite: t.rewrite || '' };
        translations[t.id] = payload;
        saved += 1;
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
      // If saved < missing, some requested messages came back unusable — this is
      // the signal for a "toggle on but nothing renders" report.
      logInfo('events.translation.saved', {
        userId,
        eventId: req.params.id,
        requested: missing.length,
        returned: (result.translations || []).length,
        saved,
        unmatched,
        truncated: meta?.truncated === true,
      });

      // Only bill the shared daily AI budget for work the user can actually
      // see. A batch that came back empty (model truncated mid tool_use) used
      // to burn a unit and cache nothing, so every retry cost another one.
      if (saved > 0) {
        await recordAiUsage(userId, 'need_translation', access.event.summary, meta);
      } else {
        logWarn('events.translation.empty', {
          userId,
          eventId: req.params.id,
          requested: missing.length,
          truncated: meta?.truncated === true,
        });
      }
      requested = missing.length;
      translated = saved;
    }

    logInfo('events.translation.respond', {
      userId,
      eventId: req.params.id,
      returnedKeys: Object.keys(translations).length,
      requested,
      translated,
    });
    res.json({ success: true, translations, ...translationStatus(requested, translated) });
  } catch (err) {
    logError('Get event translations failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '情緒翻譯暫時無法產生，請稍後再試' });
  }
});

// ---------------------------------------------------------------------------
// 治療摘要 (Therapy Note) — post-conflict structured summary
// ---------------------------------------------------------------------------

// Return the therapy note for a finished event. Generated once (the first
// partner to open it triggers it) and stored on the event, so both partners
// read the same note and re-opens cost nothing.
//
// 'closing' is allowed as well as 'resolved': the 一起收尾 panel renders its
// recap block ("這次你們各自在意的是…") straight from this note, which is what
// keeps opening 收尾 free of any new AI call.
router.get('/:id/therapy-note', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
    if (access.event.is_private) {
      return res.status(403).json({ success: false, message: '私人對話沒有治療摘要', error_code: 'PRIVATE_EVENT' });
    }
    if (access.event.status !== 'resolved' && access.event.status !== 'closing') {
      return res.status(400).json({
        success: false,
        message: '先按「一起收尾」，AI 才會為你們整理這次衝突的治療摘要。',
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
      if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });

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

// Turn a private (solo) conversation into a shared one so the partner can see
// it. Only the author can do this, and it's one-way — once the partner can see
// it there's no taking it back. This is the first step of the two-stage share
// flow: private → shared (partner sees it) → optionally 匿名公開到公開問答.
router.post('/:id/share-with-partner', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
    if (!access.event.is_private) {
      return res.status(400).json({
        success: false,
        error_code: 'ALREADY_SHARED',
        message: '這段對話伴侶已經看得到了。',
      });
    }
    if (access.event.created_by !== req.user.id) {
      return res.status(403).json({
        success: false,
        error_code: 'PRIVATE_EVENT_NOT_AUTHOR',
        message: '這是對方的私人對話，只有建立者可以決定要不要讓你看得到。',
      });
    }
    const result = await db.query(
      `UPDATE events SET is_private = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    const event = result.rows[0];
    // Let the partner know, mirroring a freshly-shared event's invitation tone.
    await notify(
      access.partnerId,
      'event_created',
      '伴侶分享了一個情境',
      event.title,
      event.id,
      req.user.id,
      2,
      event.summary
    );
    logInfo('events.shared_with_partner', { userId: req.user.id, eventId: req.params.id });
    res.json({
      success: true,
      message: '已讓伴侶看得到這段對話，你們可以一起討論了。',
      event: serializeEvent(event),
    });
  } catch (err) {
    logError('Share event with partner failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '分享失敗，請稍後再試' });
  }
});

// Share an event thread into the public 公開問答 (anonymised, read-only). Either
// partner can publish their couple's event; a single-party toggle with an
// in-app warning on the client. A private (solo) event must first be shared
// with the partner (POST /:id/share-with-partner) before it can be published —
// the public thread anonymises both participants, so it needs a shared thread.
router.post(
  '/:id/publish',
  [param('id').isUUID(), body('title').optional().isString().isLength({ max: 200 })],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const access = await assertEventAccess(req.params.id, req.user.id);
      if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
      if (access.event.is_private) {
        return res.status(400).json({
          success: false,
          error_code: 'PRIVATE_EVENT',
          message: '請先讓伴侶看得到這段對話，才能匿名公開到公開問答。',
        });
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
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
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

// Retired: the two-step 標記為解決 → 確認解決 handshake. Both endpoints now do the
// same thing as the one-tap 一起收尾 bar, and stay mounted for one release only
// so an unrefreshed tab doesn't 404 mid-flow. Delete them in a follow-up.
//
// The handshake was what made 收尾 feel like a negotiation you could lose.
// Entering closure is not a verdict about who was right, it's an invitation to
// write something down, so it needs no confirmation from the other side.
async function legacyResolveToClosing(req, res) {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
    if (access.event.is_private) {
      return res.status(403).json({
        success: false,
        message: '私人對話沒有收尾流程。想和伴侶一起定下下次的約定，可以先把它改成雙方都看得到的對話。',
        error_code: 'PRIVATE_EVENT',
      });
    }
    if (!access.partnerId) {
      return res.status(400).json({
        success: false,
        message: '收尾需要兩個人一起寫。先邀請另一半配對，配對之後就能一起定下下次的約定。',
        error_code: 'NOT_PAIRED',
      });
    }
    if (access.event.status === 'resolved') {
      return res.status(400).json({
        success: false,
        message: '你們已經完成這次收尾了。想再補上約定可以先重新開啟討論。',
        error_code: 'CLOSURE_ALREADY_FINALIZED',
      });
    }

    const { created } = await enterClosing(access, req.user.id);
    logInfo('events.closure.start', { userId: req.user.id, eventId: req.params.id, created, via: 'legacy_resolve' });

    if (created) {
      const nickname = (await db.query(`SELECT nickname FROM users WHERE id = $1`, [req.user.id])).rows[0]?.nickname || '伴侶';
      await notify(
        access.partnerId,
        'event_closing_started',
        `${nickname} 想和你一起想想下次怎麼做`,
        access.event.title,
        req.params.id,
        req.user.id
      );
    }

    const fresh = (await db.query(`SELECT * FROM events WHERE id = $1`, [req.params.id])).rows[0];
    res.json({ success: true, event: serializeEvent(fresh) });
  } catch (err) {
    logError('Legacy resolve → closing failed', { err: err.message, stack: err.stack, eventId: req.params.id });
    res.status(500).json({ success: false, message: '無法開始收尾，請稍後再試' });
  }
}

router.post('/:id/resolve-request', [param('id').isUUID()], legacyResolveToClosing);
router.post('/:id/resolve-confirm', [param('id').isUUID()], legacyResolveToClosing);

// Re-open a finished (or mid-收尾) event so the couple can keep discussing it.
router.post('/:id/reopen', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const access = await assertEventAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
    if (access.event.is_private) {
      return res.status(400).json({ success: false, message: '私人對話無法重新開啟' });
    }
    if (access.event.status !== 'resolved' && access.event.status !== 'closing') {
      return res.status(400).json({ success: false, message: '只有已解決或收尾中的對話可以重新開啟' });
    }

    const result = await db.transaction(async (client) => {
      // Abandon any closure and drop the half-written drafts, but leave ACTIVE
      // commitments alone: reopening a discussion shouldn't void a promise the
      // couple already made and is already being followed up on.
      await client.query(
        `UPDATE event_closures SET status = 'abandoned', updated_at = NOW()
          WHERE event_id = $1 AND status = 'collecting'`,
        [req.params.id]
      );
      await client.query(`DELETE FROM commitments WHERE event_id = $1 AND status = 'draft'`, [req.params.id]);
      await client.query(`DELETE FROM event_closure_participants WHERE event_id = $1`, [req.params.id]);

      return client.query(
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
    });

    await notify(
      access.partnerId,
      'event_reopened',
      // Tone guideline: 對話 over 事件.
      '伴侶想繼續聊聊這個情境',
      access.event.title,
      req.params.id,
      req.user.id
    );

    logInfo('events.reopened', { userId: req.user.id, eventId: req.params.id });
    res.json({ success: true, event: serializeEvent(result.rows[0]) });
  } catch (err) {
    logError('Reopen event failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法重新開啟對話' });
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
    res.status(403).json({ success: false, message: '私人對話無法使用引導模式', error_code: 'PRIVATE_EVENT' });
    return false;
  }
  if (access.event.status === 'resolved') {
    blocked('event_resolved');
    res.status(400).json({ success: false, message: '這段對話已完成，如需再談可先重新開啟對話', error_code: 'EVENT_RESOLVED' });
    return false;
  }
  // Replies stay open during 收尾 — only the guided-session machinery pauses,
  // so a half-finished practice can't fight the closure form for the same turn.
  if (access.event.status === 'closing') {
    blocked('event_closing');
    res.status(400).json({
      success: false,
      message: '你們正在收尾，先一起完成約定；還想再練習可以重新開啟對話。',
      error_code: 'EVENT_CLOSING',
    });
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
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
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
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
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
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
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
    if (!access) return res.status(404).json({ success: false, message: '找不到對話或沒有權限' });
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
// Reusable helpers for the dedicated-therapist endpoints (routes/therapists.js).
module.exports.listEventsForCouple = listEventsForCouple;
module.exports.getEventDetailForCouple = getEventDetailForCouple;
module.exports.insertEventMessage = insertEventMessage;
module.exports.notify = notify;
module.exports.getLatestTherapyTopicsForCouple = getLatestTherapyTopicsForCouple;
