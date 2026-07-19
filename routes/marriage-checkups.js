const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const llmService = require('../services/llmService');
const { checkLimit } = require('../lib/entitlements');
const { logInfo, logWarn, logError } = require('../lib/logger');
const { countTodayAiUsage, resolveAiLimit, recordAiUsage } = require('../lib/aiUsage');
const { notifyPartnerAction } = require('../services/notificationService');

const router = express.Router();
router.use(authenticateToken);

// Dimension ids + labels the AI prompt needs. Kept in sync with the client's
// src/data/marriageCheckup.ts (the storage keys must match).
const DIMENSIONS = [
  { id: 'communication', label: '溝通' },
  { id: 'intimacy', label: '親密' },
  { id: 'chores', label: '家務分工' },
  { id: 'finance', label: '金錢' },
  { id: 'support', label: '情緒支持' },
  { id: 'future', label: '共同未來' },
];

function sendValidationError(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
    return true;
  }
  return false;
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

// Lazy table creation — mirrors the pattern used by lib/aiUsage.js and
// routes/intimacy-requests.js so the feature works even where the migration
// runner hasn't been applied (e.g. some test DBs). Idempotent.
let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS marriage_checkups (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      couple_id     UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
      created_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status        VARCHAR(20) NOT NULL DEFAULT 'collecting',
      ai_summary    TEXT,
      ai_points     JSONB,
      created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      revealed_at   TIMESTAMP WITH TIME ZONE
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_marriage_checkups_couple ON marriage_checkups(couple_id, created_at DESC)`
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_marriage_checkups_open ON marriage_checkups(couple_id) WHERE status = 'collecting'`
  );
  await db.query(`
    CREATE TABLE IF NOT EXISTS marriage_checkup_responses (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      checkup_id    UUID NOT NULL REFERENCES marriage_checkups(id) ON DELETE CASCADE,
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answers       JSONB NOT NULL,
      submitted_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE (checkup_id, user_id)
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_marriage_checkup_responses_checkup ON marriage_checkup_responses(checkup_id)`
  );
  tablesReady = true;
}

// Load a checkup row + its responses, scoped to the user's couple. Hides the
// partner's answers until the checkup is revealed (both submitted).
async function loadCheckup(checkupId, userId, coupleId) {
  const cRes = await db.query(
    `SELECT * FROM marriage_checkups WHERE id = $1 AND couple_id = $2`,
    [checkupId, coupleId]
  );
  if (cRes.rows.length === 0) return null;
  const checkup = cRes.rows[0];
  const rRes = await db.query(
    `SELECT user_id, answers, submitted_at FROM marriage_checkup_responses WHERE checkup_id = $1`,
    [checkupId]
  );
  return { checkup, responses: rRes.rows };
}

async function fetchNickname(userId) {
  const r = await db.query(`SELECT nickname FROM users WHERE id = $1`, [userId]);
  return r.rows[0]?.nickname || '伴侶';
}

// Shape a checkup for the client. Partner answers are only included once the
// checkup is revealed; otherwise we just expose who has submitted.
function serialize(checkup, responses, userId, partnerId) {
  const mine = responses.find((r) => r.user_id === userId) || null;
  const theirs = responses.find((r) => r.user_id === partnerId) || null;
  const revealed = checkup.status === 'revealed';
  return {
    id: checkup.id,
    status: checkup.status,
    createdBy: checkup.created_by,
    createdAt: checkup.created_at,
    revealedAt: checkup.revealed_at,
    mySubmitted: !!mine,
    partnerSubmitted: !!theirs,
    myAnswers: mine ? mine.answers : null,
    // Partner answers stay hidden until both are in.
    partnerAnswers: revealed && theirs ? theirs.answers : null,
    aiSummary: revealed ? checkup.ai_summary || '' : '',
    aiPoints: revealed && Array.isArray(checkup.ai_points) ? checkup.ai_points : [],
  };
}

// GET / — the couple's current (collecting) checkup, or the most recent one.
router.get('/', async (req, res) => {
  try {
    await ensureTables();
    const userId = req.user.id;
    const couple = await getCoupleForUser(userId);
    if (!couple) {
      return res.status(409).json({
        success: false,
        message: '需要先和伴侶配對，才能一起做婚姻檢查。',
        error_code: 'NO_COUPLE_RELATIONSHIP',
      });
    }
    const cur = await db.query(
      `SELECT * FROM marriage_checkups
        WHERE couple_id = $1
        ORDER BY (status = 'collecting') DESC, created_at DESC
        LIMIT 1`,
      [couple.couple_id]
    );
    if (cur.rows.length === 0) {
      return res.json({ success: true, checkup: null });
    }
    const loaded = await loadCheckup(cur.rows[0].id, userId, couple.couple_id);
    res.json({
      success: true,
      checkup: serialize(loaded.checkup, loaded.responses, userId, couple.partner_id),
    });
  } catch (err) {
    logError('Marriage checkup get failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法載入婚姻檢查，請稍後再試。' });
  }
});

// GET /history — past revealed checkups (lightweight list).
router.get('/history', async (req, res) => {
  try {
    await ensureTables();
    const userId = req.user.id;
    const couple = await getCoupleForUser(userId);
    if (!couple) return res.json({ success: true, checkups: [] });
    const rows = await db.query(
      `SELECT id, status, created_at, revealed_at, ai_summary
         FROM marriage_checkups
        WHERE couple_id = $1 AND status = 'revealed'
        ORDER BY revealed_at DESC
        LIMIT 24`,
      [couple.couple_id]
    );
    res.json({
      success: true,
      checkups: rows.rows.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.created_at,
        revealedAt: r.revealed_at,
        aiSummary: r.ai_summary || '',
      })),
    });
  } catch (err) {
    logError('Marriage checkup history failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法載入歷史紀錄，請稍後再試。' });
  }
});

// GET /:id — a specific checkup (for opening a past one from history).
router.get('/:id', [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    await ensureTables();
    const userId = req.user.id;
    const couple = await getCoupleForUser(userId);
    if (!couple) return res.status(404).json({ success: false, message: '找不到這份婚姻檢查。' });
    const loaded = await loadCheckup(req.params.id, userId, couple.couple_id);
    if (!loaded) return res.status(404).json({ success: false, message: '找不到這份婚姻檢查。' });
    res.json({
      success: true,
      checkup: serialize(loaded.checkup, loaded.responses, userId, couple.partner_id),
    });
  } catch (err) {
    logError('Marriage checkup detail failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法載入婚姻檢查，請稍後再試。' });
  }
});

// POST / — start a new checkup. If one is already collecting, return that one
// (so both partners converge on the same review).
router.post('/', async (req, res) => {
  try {
    await ensureTables();
    const userId = req.user.id;
    const couple = await getCoupleForUser(userId);
    if (!couple) {
      return res.status(409).json({
        success: false,
        message: '需要先和伴侶配對，才能一起做婚姻檢查。',
        error_code: 'NO_COUPLE_RELATIONSHIP',
      });
    }
    const existing = await db.query(
      `SELECT * FROM marriage_checkups WHERE couple_id = $1 AND status = 'collecting' LIMIT 1`,
      [couple.couple_id]
    );
    let row;
    if (existing.rows.length > 0) {
      row = existing.rows[0];
    } else {
      const ins = await db.query(
        `INSERT INTO marriage_checkups (couple_id, created_by) VALUES ($1, $2) RETURNING *`,
        [couple.couple_id, userId]
      );
      row = ins.rows[0];
      logInfo('marriage_checkup.started', { userId, coupleId: couple.couple_id, checkupId: row.id });
      notifyPartnerAction({ actorId: userId, type: 'checkup_created' });
    }
    const loaded = await loadCheckup(row.id, userId, couple.couple_id);
    res.status(201).json({
      success: true,
      checkup: serialize(loaded.checkup, loaded.responses, userId, couple.partner_id),
    });
  } catch (err) {
    logError('Marriage checkup start failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法開始婚姻檢查，請稍後再試。' });
  }
});

// POST /:id/response — submit my answers. When both partners have submitted,
// flip to revealed and generate the neutral AI summary.
router.post(
  '/:id/response',
  [
    param('id').isUUID(),
    body('answers').isObject().withMessage('answers 必須是物件'),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      await ensureTables();
      const userId = req.user.id;
      const couple = await getCoupleForUser(userId);
      if (!couple) {
        return res.status(409).json({
          success: false,
          message: '需要先和伴侶配對，才能一起做婚姻檢查。',
          error_code: 'NO_COUPLE_RELATIONSHIP',
        });
      }

      const loaded = await loadCheckup(req.params.id, userId, couple.couple_id);
      if (!loaded) return res.status(404).json({ success: false, message: '找不到這份婚姻檢查。' });
      if (loaded.checkup.status === 'revealed') {
        return res.status(409).json({
          success: false,
          message: '這份婚姻檢查已經完成並揭曉，無法再修改答案。',
          error_code: 'CHECKUP_ALREADY_REVEALED',
        });
      }

      const answers = req.body.answers || {};
      // Normalise to the stored shape; ignore unexpected keys.
      const clean = {
        scores: answers.scores && typeof answers.scores === 'object' ? answers.scores : {},
        notes: answers.notes && typeof answers.notes === 'object' ? answers.notes : {},
        gratitude: typeof answers.gratitude === 'string' ? answers.gratitude.slice(0, 2000) : '',
        attention: typeof answers.attention === 'string' ? answers.attention.slice(0, 2000) : '',
      };

      await db.query(
        `INSERT INTO marriage_checkup_responses (checkup_id, user_id, answers)
         VALUES ($1, $2, $3)
         ON CONFLICT (checkup_id, user_id)
         DO UPDATE SET answers = EXCLUDED.answers, submitted_at = NOW()`,
        [req.params.id, userId, JSON.stringify(clean)]
      );
      logInfo('marriage_checkup.response', { userId, checkupId: req.params.id });
      notifyPartnerAction({ actorId: userId, type: 'checkup_response' });

      // Both submitted? Reveal + summarise.
      const after = await loadCheckup(req.params.id, userId, couple.couple_id);
      const bothIn = after.responses.length >= 2;
      if (bothIn && after.checkup.status !== 'revealed') {
        await maybeReveal(after, userId, couple.partner_id);
      }

      const final = await loadCheckup(req.params.id, userId, couple.couple_id);
      res.json({
        success: true,
        checkup: serialize(final.checkup, final.responses, userId, couple.partner_id),
      });
    } catch (err) {
      logError('Marriage checkup response failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '無法送出答案，請稍後再試。' });
    }
  }
);

// Generate the AI summary (best-effort) and mark the checkup revealed. The AI
// call counts against the shared daily budget but a reached limit must NOT
// block the reveal — the couple still sees each other's answers; we just skip
// the summary and note why.
async function maybeReveal(loaded, userId, partnerId) {
  const checkupId = loaded.checkup.id;
  const mine = loaded.responses.find((r) => r.user_id === userId);
  const theirs = loaded.responses.find((r) => r.user_id === partnerId);

  let aiSummary = '';
  let aiPoints = [];
  try {
    const { tier, limit } = await resolveAiLimit(userId);
    const usedToday = await countTodayAiUsage(userId);
    const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
    if (!limitCheck.ok) {
      logInfo('marriage_checkup.summary.limit', { userId, used: usedToday, limit, tier, blocked: true });
      aiSummary = '今日 AI 次數已達上限，這次先看看彼此的答案，過了今天再回來看 AI 的中立總結，或升級 Premium 提高每日上限。';
    } else {
      const [myName, theirName] = await Promise.all([fetchNickname(userId), fetchNickname(partnerId)]);
      const result = await llmService.generateCheckupSummary({
        dimensions: DIMENSIONS,
        responseA: { name: myName, answers: mine ? mine.answers : {} },
        responseB: { name: theirName, answers: theirs ? theirs.answers : {} },
      });
      const meta = result._meta;
      aiSummary = result.summary || '';
      aiPoints = Array.isArray(result.points) ? result.points : [];
      logInfo('marriage_checkup.summary.cost', {
        userId,
        provider: meta?.provider,
        model: meta?.model,
        costUsd: meta?.costUsd,
        durationMs: meta?.durationMs,
      });
      await recordAiUsage(userId, 'marriage_checkup', 'marriage_checkup', meta);
    }
  } catch (err) {
    // Don't fail the reveal just because the LLM hiccuped.
    logWarn('marriage_checkup.summary.failed', { err: err.message, checkupId });
    aiSummary = 'AI 暫時無法產生總結，但你們還是可以先看看彼此的答案、聊聊看。稍後可以再回來看看 AI 的建議。';
  }

  await db.query(
    `UPDATE marriage_checkups
        SET status = 'revealed', ai_summary = $2, ai_points = $3, revealed_at = NOW()
      WHERE id = $1 AND status = 'collecting'`,
    [checkupId, aiSummary, JSON.stringify(aiPoints)]
  );
}

module.exports = router;
