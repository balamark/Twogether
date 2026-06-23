// User feedback / reviews ("用戶心得").
//
//   POST /api/feedback           (auth)   submit a rating + review (status=pending)
//   GET  /api/feedback/mine      (auth)   the caller's own submissions + statuses
//   GET  /api/feedback/approved  (public) approved reviews for the logged-out page
//
// Admin moderation lives in routes/admin.js (adminApiRouter): list pending +
// approve / hide. Mirrors the therapist_reviews moderation flow.

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const { logInfo, logWarn } = require('../lib/logger');

const router = express.Router();

// Shape a DB row into the public testimonial shape used by the frontend.
function toPublic(row) {
  return {
    id: row.id,
    name: row.display_name,
    rating: row.rating,
    content: row.body,
    createdAt: row.created_at,
  };
}

// GET /api/feedback/approved — public social proof, newest first.
router.get('/approved', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, display_name, rating, body, created_at
         FROM user_feedback
        WHERE status = 'approved'
        ORDER BY created_at DESC
        LIMIT 12`
    );
    res.json({ reviews: result.rows.map(toPublic) });
  } catch (error) {
    // Decorative section — never 500 the landing page. Surface as empty.
    logDbError('feedback.approved', error);
    res.json({ reviews: [] });
  }
});

// GET /api/feedback/mine — the caller's own submissions (with status).
router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, display_name, rating, body, status, created_at
         FROM user_feedback
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({
      feedback: result.rows.map((r) => ({ ...toPublic(r), status: r.status })),
    });
  } catch (error) {
    logDbError('feedback.mine', error, { userId: req.user.id });
    res.status(500).json(errorResponseBody('無法載入你的評價，請稍後再試。', error));
  }
});

// POST /api/feedback — submit a review (goes to the moderation queue).
router.post(
  '/',
  authenticateToken,
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('請給 1 到 5 顆星的評分'),
    body('body')
      .isString()
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('評價內容請介於 1 到 2000 字'),
    body('displayName').optional().isString().trim().isLength({ max: 80 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: errors.array()[0].msg,
        error_code: 'FEEDBACK_INVALID',
      });
    }

    const userId = req.user.id;
    const { rating, body: reviewBody } = req.body;
    // Fall back to the account nickname when no display name is given.
    const displayName =
      (req.body.displayName && req.body.displayName.trim()) ||
      req.user.nickname ||
      '匿名用戶';

    try {
      const result = await db.query(
        `INSERT INTO user_feedback (user_id, display_name, rating, body, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, display_name, rating, body, status, created_at`,
        [userId, displayName, rating, reviewBody.trim()]
      );
      logInfo('feedback.submitted', { userId, rating, feedbackId: result.rows[0].id });
      res.status(201).json({
        success: true,
        message: '感謝你的回饋！審核通過後就會顯示在首頁。',
        feedback: { ...toPublic(result.rows[0]), status: result.rows[0].status },
      });
    } catch (error) {
      logDbError('feedback.submit', error, { userId });
      logWarn('feedback.submit.failed', { userId });
      res
        .status(500)
        .json(errorResponseBody('送出評價失敗，請稍後再試。', error));
    }
  }
);

module.exports = router;
