// Per-user psychological assessments (愛的語言 love languages, and future quizzes
// like MBTI / 星座). Generic by `type` so new quizzes reuse this plumbing.
//
//   GET  /api/assessments            — the caller's assessments (all types)
//   PUT  /api/assessments/:type      — upsert the caller's result for a type
//   GET  /api/assessments/partner    — the partner's results (for couple visibility)

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const { logInfo } = require('../lib/logger');

const router = express.Router();
router.use(authenticateToken);

const KNOWN_TYPES = ['love_language', 'mbti', 'zodiac'];

function toAssessment(row) {
  return {
    type: row.type,
    result: row.result,
    scores: row.scores || {},
    updatedAt: row.updated_at,
  };
}

// GET /api/assessments — the caller's own assessments.
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT type, result, scores, updated_at
         FROM user_assessments WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ assessments: result.rows.map(toAssessment) });
  } catch (error) {
    logDbError('assessments.list', error, { userId: req.user.id });
    res.status(500).json(errorResponseBody('無法載入測驗結果，請稍後再試。', error));
  }
});

// GET /api/assessments/partner — partner's results (result only, no need for
// the full breakdown), so the couple can see how to love each other.
router.get('/partner', async (req, res) => {
  try {
    const couple = await db.query(
      `SELECT CASE WHEN user1_id = $1 THEN user2_id ELSE user1_id END AS partner_id
         FROM couples WHERE user1_id = $1 OR user2_id = $1`,
      [req.user.id]
    );
    const partnerId = couple.rows[0]?.partner_id;
    if (!partnerId) return res.json({ partner: null, assessments: [] });

    const [u, a] = await Promise.all([
      db.query(`SELECT nickname FROM users WHERE id = $1`, [partnerId]),
      db.query(
        `SELECT type, result, updated_at FROM user_assessments WHERE user_id = $1`,
        [partnerId]
      ),
    ]);
    res.json({
      partner: { nickname: u.rows[0]?.nickname || '伴侶' },
      assessments: a.rows.map((r) => ({ type: r.type, result: r.result, updatedAt: r.updated_at })),
    });
  } catch (error) {
    logDbError('assessments.partner', error, { userId: req.user.id });
    res.status(500).json(errorResponseBody('無法載入伴侶的測驗結果，請稍後再試。', error));
  }
});

// PUT /api/assessments/:type — upsert the caller's result for a type.
router.put(
  '/:type',
  [
    param('type').isIn(KNOWN_TYPES).withMessage('未知的測驗類型'),
    body('result').isString().trim().isLength({ min: 1, max: 32 }).withMessage('缺少測驗結果'),
    body('scores').optional().isObject(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg, error_code: 'ASSESSMENT_INVALID' });
    }
    try {
      const scores = req.body.scores && typeof req.body.scores === 'object' ? req.body.scores : {};
      const result = await db.query(
        `INSERT INTO user_assessments (user_id, type, result, scores, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, type)
         DO UPDATE SET result = EXCLUDED.result, scores = EXCLUDED.scores, updated_at = NOW()
         RETURNING type, result, scores, updated_at`,
        [req.user.id, req.params.type, req.body.result.trim(), JSON.stringify(scores)]
      );
      logInfo('assessments.saved', { userId: req.user.id, type: req.params.type, result: req.body.result });
      res.json({ success: true, message: '測驗結果已儲存', assessment: toAssessment(result.rows[0]) });
    } catch (error) {
      logDbError('assessments.save', error, { userId: req.user.id, type: req.params.type });
      res.status(500).json(errorResponseBody('儲存測驗結果失敗，請稍後再試。', error));
    }
  }
);

module.exports = router;
