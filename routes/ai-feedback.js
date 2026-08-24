// 👍/👎 feedback on AI-generated responses (情緒翻譯 / AI 諮商師).
//
//   POST /api/ai-feedback   (auth)  up/down a specific AI output; re-voting
//                                    updates the same row. Down-votes capture a
//                                    context snapshot so bad cases (chiefly 你/我
//                                    perspective errors) can be diagnosed and,
//                                    later, curated into the reflection judge's
//                                    rubric.
//
// Best-effort analytics: the frontend fires-and-forgets, so this never blocks a
// user flow (a 500 only ever happens on a DB error). Mirrors the roleplay
// message feedback endpoint (routes/intimacy-requests.js).

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const { logInfo, logWarn } = require('../lib/logger');

const router = express.Router();

const SURFACES = ['emotion_translation', 'counselor'];

// The migration (088) is the source of truth; this runtime-ensure keeps the
// endpoint working on environments where migrations haven't run yet, matching
// how event_ai_usage / roleplay_message_feedback bootstrap themselves.
let ensured = false;
async function ensureAiFeedbackTable() {
  if (ensured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_response_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      surface VARCHAR(32) NOT NULL,
      reference_id UUID,
      message_text TEXT,
      context_snapshot JSONB,
      rating VARCHAR(8) NOT NULL,
      feedback_text TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_response_feedback_user_ref
      ON ai_response_feedback (user_id, surface, reference_id)
  `);
  // Phase 2 curation columns (migration 089) — admins promote a down-vote into a
  // negative example for the judge. Kept here too so the admin flow works before
  // migrations run.
  await db.query(`
    ALTER TABLE ai_response_feedback
      ADD COLUMN IF NOT EXISTS curated_negative BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS curated_note TEXT,
      ADD COLUMN IF NOT EXISTS curated_at TIMESTAMP WITH TIME ZONE
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_ai_response_feedback_curated
      ON ai_response_feedback (surface, curated_at DESC)
      WHERE curated_negative
  `);
  ensured = true;
}

router.post(
  '/',
  authenticateToken,
  [
    body('surface').isIn(SURFACES).withMessage('回饋對象無效'),
    body('rating').isIn(['up', 'down']).withMessage('rating 必須為 up 或 down'),
    body('referenceId').optional({ nullable: true }).isUUID().withMessage('referenceId 需為有效 UUID'),
    body('messageText').optional({ nullable: true }).isLength({ max: 4000 }),
    body('feedbackText').optional({ nullable: true }).isLength({ max: 1000 })
      .withMessage('說明請在 1000 字以內'),
    body('contextSnapshot').optional({ nullable: true }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg,
        error_code: 'AI_FEEDBACK_INVALID',
      });
    }

    const userId = req.user.id;
    const { surface, rating } = req.body;
    const referenceId = req.body.referenceId || null;
    const messageText = req.body.messageText || null;
    const feedbackText = req.body.feedbackText || null;
    const contextSnapshot =
      req.body.contextSnapshot != null ? JSON.stringify(req.body.contextSnapshot) : null;

    try {
      await ensureAiFeedbackTable();
      await db.query(
        `INSERT INTO ai_response_feedback
           (user_id, surface, reference_id, message_text, context_snapshot, rating, feedback_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, surface, reference_id)
         DO UPDATE SET rating = EXCLUDED.rating,
                       message_text = EXCLUDED.message_text,
                       context_snapshot = EXCLUDED.context_snapshot,
                       feedback_text = EXCLUDED.feedback_text,
                       updated_at = NOW()`,
        [userId, surface, referenceId, messageText, contextSnapshot, rating, feedbackText]
      );
      logInfo('ai_feedback.submitted', { userId, surface, rating, hasText: !!feedbackText });
      if (rating === 'down') {
        // Surface bad cases in Cloud Logging so they can be reviewed and, later,
        // curated into negative examples for the reflection judge's rubric.
        logWarn('ai_feedback.downvote', { userId, surface, referenceId, hasText: !!feedbackText });
      }
      res.json({ success: true });
    } catch (error) {
      logDbError('ai_feedback.submit', error, { userId, surface });
      res.status(500).json(errorResponseBody('回饋送出失敗，請稍後再試。', error));
    }
  }
);

// Exported so the admin curation endpoints (routes/admin.js) can guarantee the
// table + curation columns exist before reading/updating them.
router.ensureAiFeedbackTable = ensureAiFeedbackTable;
module.exports = router;
