// 真實情侶會怎麼做 (Community polls): curated open-ended relationship scenarios.
// Signed-in users vote among options and can leave a short 心聲 (voice). Public
// read (optionalAuth) so visitors see the split and are pulled into signing up.

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();
const adminRouter = express.Router();

const REPORT_REASONS = ['inappropriate', 'spam', 'privacy', 'other'];

function sendValidationError(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: '驗證失敗', errors: errors.array() });
    return true;
  }
  return false;
}

// Shared shape builder: poll + options with per-option vote counts + the
// viewer's current pick. `voiceCount` for the list; full voices on detail.
async function loadPoll(pollId, userId) {
  const pollRes = await db.query(
    `SELECT id, question, scenario, tags, status, created_at
       FROM community_polls WHERE id = $1`,
    [pollId]
  );
  const poll = pollRes.rows[0];
  if (!poll || poll.status !== 'published') return null;

  const optsRes = await db.query(
    `SELECT o.id, o.label, o.sort_order,
            COUNT(v.id)::int AS votes
       FROM poll_options o
       LEFT JOIN poll_votes v ON v.option_id = o.id
      WHERE o.poll_id = $1
      GROUP BY o.id, o.label, o.sort_order
      ORDER BY o.sort_order`,
    [pollId]
  );
  const totalVotes = optsRes.rows.reduce((n, o) => n + o.votes, 0);

  let myOptionId = null;
  if (userId) {
    const mine = await db.query(
      `SELECT option_id FROM poll_votes WHERE poll_id = $1 AND voter_id = $2`,
      [pollId, userId]
    );
    myOptionId = mine.rows[0]?.option_id || null;
  }

  return {
    id: poll.id,
    question: poll.question,
    scenario: poll.scenario,
    tags: poll.tags || [],
    totalVotes,
    myOptionId,
    options: optsRes.rows.map((o) => ({
      id: o.id,
      label: o.label,
      votes: o.votes,
      percent: totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// List polls (with vote splits so results are visible without opening detail)
// ---------------------------------------------------------------------------
router.get('/', optionalAuth, async (req, res) => {
  try {
    const listRes = await db.query(
      `SELECT id FROM community_polls WHERE status = 'published'
        ORDER BY sort_weight DESC, created_at DESC LIMIT 50`
    );
    const polls = [];
    for (const row of listRes.rows) {
      const poll = await loadPoll(row.id, req.user?.id);
      if (poll) {
        const vc = await db.query(
          `SELECT COUNT(*)::int AS n FROM poll_voices WHERE poll_id = $1 AND status = 'published'`,
          [row.id]
        );
        polls.push({ ...poll, voiceCount: vc.rows[0].n });
      }
    }
    res.json({ success: true, polls });
  } catch (err) {
    logError('List polls failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法載入投票，請稍後再試' });
  }
});

// ---------------------------------------------------------------------------
// Poll detail (+ voices)
// ---------------------------------------------------------------------------
router.get('/:id', optionalAuth, [param('id').isUUID()], async (req, res) => {
  if (sendValidationError(req, res)) return;
  try {
    const poll = await loadPoll(req.params.id, req.user?.id);
    if (!poll) return res.status(404).json({ success: false, message: '找不到這則投票' });

    const voicesRes = await db.query(
      `SELECT vc.id, vc.body, vc.option_id, vc.author_id, vc.created_at,
              u.nickname, u.public_share_show_nickname, o.label AS option_label
         FROM poll_voices vc
         JOIN users u ON u.id = vc.author_id
         LEFT JOIN poll_options o ON o.id = vc.option_id
        WHERE vc.poll_id = $1 AND vc.status = 'published'
        ORDER BY vc.created_at DESC
        LIMIT 100`,
      [req.params.id]
    );
    const voices = voicesRes.rows.map((v) => ({
      id: v.id,
      body: v.body,
      optionLabel: v.option_label || null,
      authorName: v.public_share_show_nickname !== false ? (v.nickname || '匿名') : '匿名',
      isMine: !!req.user && v.author_id === req.user.id,
      createdAt: v.created_at,
    }));

    res.json({ success: true, poll: { ...poll, voices } });
  } catch (err) {
    logError('Get poll failed', { err: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: '無法載入投票內容' });
  }
});

// ---------------------------------------------------------------------------
// Vote (upsert: re-voting moves the pick)
// ---------------------------------------------------------------------------
router.post(
  '/:id/vote',
  authenticateToken,
  [param('id').isUUID(), body('optionId').isUUID()],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const { optionId } = req.body;
      const valid = await db.query(
        `SELECT o.id FROM poll_options o
           JOIN community_polls p ON p.id = o.poll_id
          WHERE o.id = $1 AND o.poll_id = $2 AND p.status = 'published'`,
        [optionId, req.params.id]
      );
      if (valid.rows.length === 0) {
        return res.status(404).json({ success: false, message: '找不到這個選項' });
      }

      await db.query(
        `INSERT INTO poll_votes (poll_id, option_id, voter_id) VALUES ($1, $2, $3)
         ON CONFLICT (poll_id, voter_id)
         DO UPDATE SET option_id = EXCLUDED.option_id, created_at = NOW()`,
        [req.params.id, optionId, req.user.id]
      );
      logInfo('poll.vote', { userId: req.user.id, pollId: req.params.id, optionId });

      const poll = await loadPoll(req.params.id, req.user.id);
      res.json({ success: true, poll });
    } catch (err) {
      logError('Poll vote failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '投票失敗，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// Leave a 心聲 (voice)
// ---------------------------------------------------------------------------
router.post(
  '/:id/voices',
  authenticateToken,
  [
    param('id').isUUID(),
    body('body').isString().trim().isLength({ min: 1, max: 500 })
      .withMessage('心聲需在 1 到 500 字之間'),
    body('optionId').optional({ nullable: true }).isUUID(),
  ],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const poll = await db.query(
        `SELECT id FROM community_polls WHERE id = $1 AND status = 'published'`,
        [req.params.id]
      );
      if (poll.rows.length === 0) return res.status(404).json({ success: false, message: '找不到這則投票' });

      // If an option is given, it must belong to this poll.
      let optionId = req.body.optionId || null;
      if (optionId) {
        const ok = await db.query(`SELECT id FROM poll_options WHERE id = $1 AND poll_id = $2`, [optionId, req.params.id]);
        if (ok.rows.length === 0) optionId = null;
      }

      const ins = await db.query(
        `INSERT INTO poll_voices (poll_id, option_id, author_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING id, body, option_id, created_at`,
        [req.params.id, optionId, req.user.id, req.body.body.trim()]
      );
      const v = ins.rows[0];
      logInfo('poll.voice', { userId: req.user.id, pollId: req.params.id, voiceId: v.id });

      const me = await db.query(
        `SELECT nickname, public_share_show_nickname FROM users WHERE id = $1`,
        [req.user.id]
      );
      const meRow = me.rows[0] || {};
      let optionLabel = null;
      if (optionId) {
        const o = await db.query(`SELECT label FROM poll_options WHERE id = $1`, [optionId]);
        optionLabel = o.rows[0]?.label || null;
      }
      res.status(201).json({
        success: true,
        voice: {
          id: v.id,
          body: v.body,
          optionLabel,
          authorName: meRow.public_share_show_nickname !== false ? (meRow.nickname || '匿名') : '匿名',
          isMine: true,
          createdAt: v.created_at,
        },
      });
    } catch (err) {
      logError('Poll voice failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '心聲送出失敗，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// Report a voice
// ---------------------------------------------------------------------------
router.post(
  '/voices/:id/report',
  authenticateToken,
  [param('id').isUUID(), body('reason').isIn(REPORT_REASONS)],
  async (req, res) => {
    if (sendValidationError(req, res)) return;
    try {
      const exists = await db.query(`SELECT id FROM poll_voices WHERE id = $1`, [req.params.id]);
      if (exists.rows.length === 0) return res.status(404).json({ success: false, message: '找不到這則心聲' });
      await db.query(
        `INSERT INTO poll_voice_reports (voice_id, reporter_user_id, reason)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [req.params.id, req.user.id, req.body.reason]
      );
      logInfo('poll.voice.reported', { voiceId: req.params.id, reporterId: req.user.id, reason: req.body.reason });
      res.json({ success: true, message: '已收到你的檢舉，我們會盡快處理' });
    } catch (err) {
      logError('Poll voice report failed', { err: err.message, stack: err.stack });
      res.status(500).json({ success: false, message: '檢舉送出失敗，請稍後再試' });
    }
  }
);

// ---------------------------------------------------------------------------
// Admin: voice reports + moderation
// ---------------------------------------------------------------------------
adminRouter.get('/voice-reports', async (req, res) => {
  try {
    const status = ['pending', 'reviewed', 'resolved'].includes(req.query.status) ? req.query.status : 'pending';
    const result = await db.query(
      `SELECT r.id, r.reason, r.status, r.created_at,
              vc.id AS voice_id, vc.body AS voice_body, vc.status AS voice_status,
              p.question, ru.email AS reporter_email
         FROM poll_voice_reports r
         JOIN poll_voices vc ON vc.id = r.voice_id
         JOIN community_polls p ON p.id = vc.poll_id
         JOIN users ru ON ru.id = r.reporter_user_id
        WHERE r.status = $1
        ORDER BY r.created_at DESC LIMIT 100`,
      [status]
    );
    res.json({ success: true, reports: result.rows });
  } catch (err) {
    logError('Admin poll voice reports failed', { err: err.message });
    res.status(500).json({ success: false, message: 'failed' });
  }
});

adminRouter.post('/voices/:id/moderate', async (req, res) => {
  try {
    const action = req.body?.action;
    if (!['hide', 'restore'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be hide|restore' });
    }
    const status = action === 'hide' ? 'hidden' : 'published';
    const result = await db.query(
      `UPDATE poll_voices SET status = $1 WHERE id = $2 RETURNING id`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'not found' });
    await db.query(`UPDATE poll_voice_reports SET status = 'reviewed' WHERE voice_id = $1 AND status = 'pending'`, [req.params.id]);
    logInfo('poll.voice.moderated', { voiceId: req.params.id, action });
    res.json({ success: true });
  } catch (err) {
    logError('Admin moderate poll voice failed', { err: err.message });
    res.status(500).json({ success: false, message: 'failed' });
  }
});

module.exports = { router, adminRouter };
