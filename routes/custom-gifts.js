const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const { logInfo, logWarn, logError } = require('../lib/logger');
const { notifyPartnerAction } = require('../services/notificationService');

const router = express.Router();

// Keys of the built-in gift catalog (defaultGifts in src/App.tsx). Couples can
// hide these or replace them with an edited custom copy; anything else is
// rejected so hidden_default_gifts can't fill with junk keys.
const DEFAULT_GIFT_KEYS = ['massage', 'dinner', 'movie_night', 'oral_service', 'babysitting', 'shopping'];

// All custom gift routes require authentication
router.use(authenticateToken);

const findCoupleId = async (userId, client = db) => {
  const coupleResult = await client.query(
    'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
    [userId]
  );
  return coupleResult.rows.length > 0 ? coupleResult.rows[0].id : null;
};

const toApiGift = (gift) => ({
  id: gift.id,
  title: gift.title,
  description: gift.description,
  cost: gift.cost,
  category: gift.category,
  icon: gift.icon,
  isCustom: true,
  createdBy: gift.created_by,
  createdAt: gift.created_at
});

// Hide a default gift for the caller's scope (couple when paired, else
// personal). Idempotent: hiding an already-hidden key is a no-op.
const hideDefaultGift = (client, coupleId, userId, giftKey) => (
  coupleId
    ? client.query(`
        INSERT INTO hidden_default_gifts (couple_id, user_id, gift_key)
        VALUES ($1, $2, $3)
        ON CONFLICT (couple_id, gift_key) WHERE couple_id IS NOT NULL DO NOTHING
      `, [coupleId, userId, giftKey])
    : client.query(`
        INSERT INTO hidden_default_gifts (couple_id, user_id, gift_key)
        VALUES (NULL, $1, $2)
        ON CONFLICT (user_id, gift_key) WHERE couple_id IS NULL DO NOTHING
      `, [userId, giftKey])
);

// Postgres INTEGER max: the only limit on a gift's price.
const GIFT_COST_MAX = 2147483647;

const giftValidators = (optional) => {
  const field = (name) => (optional ? body(name).optional() : body(name));
  return [
    field('title')
      .isLength({ min: 1, max: 100 })
      .withMessage('標題必須在1-100個字符之間'),
    field('description')
      .isLength({ min: 1, max: 500 })
      .withMessage('描述必須在1-500個字符之間'),
    field('cost')
      // No product cap on a gift's price — only the INTEGER column's ceiling.
      .isInt({ min: 1, max: GIFT_COST_MAX })
      .withMessage('花費必須是大於 0 的整數'),
    field('category')
      .isIn(['service', 'experience', 'physical', 'intimate'])
      .withMessage('無效的禮品類別'),
    body('icon')
      .optional()
      .isLength({ min: 1, max: 10 })
      .withMessage('圖標不能超過10個字符')
  ];
};

const rejectInvalid = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({
    success: false,
    // Surface the first field's own message so the user knows what to fix.
    message: errors.array()[0].msg,
    error_code: 'GIFT_VALIDATION_FAILED',
    errors: errors.array()
  });
  return true;
};

// Get custom gifts for user's couple or personal gifts, plus which default
// gifts this couple has removed/replaced.
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const coupleId = await findCoupleId(userId);

    // Get custom gifts for the couple OR personal gifts created by this user
    const [giftsResult, hiddenResult] = await Promise.all([
      db.query(`
        SELECT
          id, title, description, cost, category, icon,
          created_by, created_at, updated_at
        FROM custom_gifts
        WHERE couple_id = $1 OR (couple_id IS NULL AND created_by = $2)
        ORDER BY created_at DESC
      `, [coupleId, userId]),
      db.query(`
        SELECT gift_key
        FROM hidden_default_gifts
        WHERE couple_id = $1 OR (couple_id IS NULL AND user_id = $2)
      `, [coupleId, userId])
    ]);

    res.json({
      success: true,
      custom_gifts: giftsResult.rows.map(toApiGift),
      hidden_defaults: [...new Set(hiddenResult.rows.map(r => r.gift_key))]
    });

  } catch (error) {
    logDbError('Get custom gifts error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法獲取自訂禮品', error));
  }
});

// Create new custom gift. With `replaces_default`, the new gift is an edited
// copy of a built-in gift: it's created and the original hidden atomically.
router.post('/', [
  ...giftValidators(false),
  body('replaces_default')
    .optional({ nullable: true })
    .isIn(DEFAULT_GIFT_KEYS)
    .withMessage('找不到要修改的預設禮品，請重新整理頁面後再試')
], async (req, res) => {
  try {
    if (rejectInvalid(req, res)) return;

    const { title, description, cost, category, icon = '🎁', replaces_default } = req.body;
    const userId = req.user.id;

    const gift = await db.transaction(async (client) => {
      // Use couple_id if exists, otherwise null for personal gifts
      const coupleId = await findCoupleId(userId, client);
      const giftResult = await client.query(`
        INSERT INTO custom_gifts (
          couple_id, title, description, cost, category, icon, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, title, description, cost, category, icon, created_by, created_at
      `, [coupleId, title, description, cost, category, icon, userId]);
      if (replaces_default) {
        await hideDefaultGift(client, coupleId, userId, replaces_default);
      }
      return giftResult.rows[0];
    });

    logInfo('Custom gift created', {
      user_id: userId,
      gift_id: gift.id,
      cost: gift.cost,
      replaces_default: replaces_default || null
    });

    notifyPartnerAction({
      actorId: userId,
      type: replaces_default ? 'custom_gift_updated' : 'custom_gift_created',
      content: gift.title ? `${gift.icon || '🎁'} ${gift.title}` : null,
    });

    res.json({
      success: true,
      message: replaces_default ? '禮品更新成功' : '禮品創建成功',
      custom_gift: toApiGift(gift),
      replaced_default: replaces_default || null
    });

  } catch (error) {
    logDbError('Create custom gift error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('創建禮品失敗，請稍後再試', error));
  }
});

// Restore every removed/replaced default gift. Replacement copies stay as
// custom gifts — the couple can remove those separately if they want.
router.delete('/defaults/hidden', async (req, res) => {
  try {
    const userId = req.user.id;
    const coupleId = await findCoupleId(userId);

    const result = await db.query(`
      DELETE FROM hidden_default_gifts
      WHERE couple_id = $1 OR (couple_id IS NULL AND user_id = $2)
    `, [coupleId, userId]);

    logInfo('Default gifts restored', { user_id: userId, couple_id: coupleId, restored: result.rowCount });

    res.json({
      success: true,
      message: '已恢復預設禮品',
      restored: result.rowCount
    });

  } catch (error) {
    logDbError('Restore default gifts error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('恢復預設禮品失敗，請稍後再試', error));
  }
});

// Remove (hide) one built-in default gift for this couple.
router.delete('/defaults/:key', async (req, res) => {
  try {
    const userId = req.user.id;
    const giftKey = req.params.key;

    if (!DEFAULT_GIFT_KEYS.includes(giftKey)) {
      logWarn('Hide default gift rejected: unknown key', { user_id: userId, gift_key: giftKey });
      return res.status(404).json({
        success: false,
        message: '找不到要移除的預設禮品，請重新整理頁面後再試',
        error_code: 'DEFAULT_GIFT_NOT_FOUND'
      });
    }

    const coupleId = await findCoupleId(userId);
    await hideDefaultGift(db, coupleId, userId, giftKey);

    logInfo('Default gift hidden', { user_id: userId, couple_id: coupleId, gift_key: giftKey });

    res.json({
      success: true,
      message: '禮品刪除成功'
    });

  } catch (error) {
    logDbError('Hide default gift error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('刪除禮品失敗，請稍後再試', error));
  }
});

// Update custom gift
router.put('/:id', giftValidators(true), async (req, res) => {
  try {
    if (rejectInvalid(req, res)) return;

    const giftId = req.params.id;
    const userId = req.user.id;
    const updates = req.body;

    // Verify gift ownership - check if user created it or is in the couple
    const giftResult = await db.query(`
      SELECT cg.*
      FROM custom_gifts cg
      LEFT JOIN couples c ON cg.couple_id = c.id
      WHERE cg.id = $1 AND (
        cg.created_by = $2 OR
        c.user1_id = $2 OR
        c.user2_id = $2
      )
    `, [giftId, userId]);

    if (giftResult.rows.length === 0) {
      logWarn('Update custom gift rejected: not found or not owned', { user_id: userId, gift_id: giftId });
      return res.status(404).json({
        success: false,
        message: '找不到禮品或無權限修改',
        error_code: 'GIFT_NOT_FOUND'
      });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (['title', 'description', 'cost', 'category', 'icon'].includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        updateValues.push(updates[key]);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: '沒有提供有效的更新字段',
        error_code: 'GIFT_VALIDATION_FAILED'
      });
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(giftId);

    const updateQuery = `
      UPDATE custom_gifts
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, title, description, cost, category, icon, created_by, created_at, updated_at
    `;

    const updatedResult = await db.query(updateQuery, updateValues);
    const gift = updatedResult.rows[0];

    logInfo('Custom gift updated', { user_id: userId, gift_id: giftId, fields: Object.keys(updates) });

    notifyPartnerAction({
      actorId: userId,
      type: 'custom_gift_updated',
      content: gift.title ? `${gift.icon || '🎁'} ${gift.title}` : null,
    });

    res.json({
      success: true,
      message: '禮品更新成功',
      custom_gift: toApiGift(gift)
    });

  } catch (error) {
    logError('Update custom gift failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新禮品失敗，請稍後再試'
    });
  }
});

// Delete custom gift
router.delete('/:id', async (req, res) => {
  try {
    const giftId = req.params.id;
    const userId = req.user.id;

    // Verify gift ownership - check if user created it or is in the couple
    const giftResult = await db.query(`
      SELECT cg.id, cg.title, cg.icon
      FROM custom_gifts cg
      LEFT JOIN couples c ON cg.couple_id = c.id
      WHERE cg.id = $1 AND (
        cg.created_by = $2 OR
        c.user1_id = $2 OR
        c.user2_id = $2
      )
    `, [giftId, userId]);

    if (giftResult.rows.length === 0) {
      logWarn('Delete custom gift rejected: not found or not owned', { user_id: userId, gift_id: giftId });
      return res.status(404).json({
        success: false,
        message: '找不到禮品或無權限刪除',
        error_code: 'GIFT_NOT_FOUND'
      });
    }

    await db.query('DELETE FROM custom_gifts WHERE id = $1', [giftId]);

    logInfo('Custom gift deleted', { user_id: userId, gift_id: giftId });

    notifyPartnerAction({
      actorId: userId,
      type: 'custom_gift_deleted',
      content: giftResult.rows[0].title
        ? `${giftResult.rows[0].icon || '🎁'} ${giftResult.rows[0].title}`
        : null,
    });

    res.json({
      success: true,
      message: '禮品刪除成功'
    });

  } catch (error) {
    logError('Delete custom gift failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '刪除禮品失敗，請稍後再試'
    });
  }
});

module.exports = router;
