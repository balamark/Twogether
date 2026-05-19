const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');

const router = express.Router();

router.use(authenticateToken);

async function getCoupleId(userId) {
  const result = await db.query(
    'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

// GET /api/script-favorites — list favorite script_ids for current user's
// couple (or personal favorites when unpaired).
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const coupleId = await getCoupleId(userId);

    const result = await db.query(
      `SELECT DISTINCT script_id
         FROM script_favorites
        WHERE ($1::uuid IS NOT NULL AND couple_id = $1)
           OR ($1::uuid IS NULL AND couple_id IS NULL AND favorited_by = $2)
        ORDER BY script_id`,
      [coupleId, userId]
    );

    res.json({
      success: true,
      favorites: result.rows.map(r => r.script_id),
    });
  } catch (error) {
    logDbError('Get script favorites error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法獲取最愛劇本', error));
  }
});

// POST /api/script-favorites — add a favorite. Idempotent.
router.post('/', [
  body('scriptId')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('劇本 ID 必須是 1-100 字元的字串'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array(),
      });
    }

    const { scriptId } = req.body;
    const userId = req.user.id;
    const coupleId = await getCoupleId(userId);

    // Two partial unique indexes — one for couple-scoped rows, one for
    // unpaired-user rows. ON CONFLICT DO NOTHING without a target lets either
    // applicable index handle the dedup, so re-favoriting is a silent no-op.
    await db.query(
      `INSERT INTO script_favorites (couple_id, script_id, favorited_by)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [coupleId, scriptId, userId]
    );

    res.json({ success: true });
  } catch (error) {
    logDbError('Add script favorite error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法加入最愛劇本', error));
  }
});

// DELETE /api/script-favorites/:scriptId — remove a favorite. Idempotent.
router.delete('/:scriptId', [
  param('scriptId')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('劇本 ID 必須是 1-100 字元的字串'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array(),
      });
    }

    const userId = req.user.id;
    const coupleId = await getCoupleId(userId);
    const { scriptId } = req.params;

    await db.query(
      `DELETE FROM script_favorites
        WHERE script_id = $1
          AND (($2::uuid IS NOT NULL AND couple_id = $2)
            OR ($2::uuid IS NULL AND couple_id IS NULL AND favorited_by = $3))`,
      [scriptId, coupleId, userId]
    );

    res.json({ success: true });
  } catch (error) {
    logDbError('Remove script favorite error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法移除最愛劇本', error));
  }
});

module.exports = router;
