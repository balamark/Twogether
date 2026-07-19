const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const { logError } = require('../lib/logger');
const { notifyPartnerAction } = require('../services/notificationService');

const router = express.Router();

// All custom gift routes require authentication
router.use(authenticateToken);

// Get custom gifts for user's couple or personal gifts
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Find user's couple
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    const coupleId = coupleResult.rows.length > 0 ? coupleResult.rows[0].id : null;

    // Get custom gifts for the couple OR personal gifts created by this user
    const giftsResult = await db.query(`
      SELECT
        id, title, description, cost, category, icon,
        created_by, created_at, updated_at
      FROM custom_gifts
      WHERE couple_id = $1 OR (couple_id IS NULL AND created_by = $2)
      ORDER BY created_at DESC
    `, [coupleId, userId]);

    const gifts = giftsResult.rows.map(gift => ({
      id: gift.id,
      title: gift.title,
      description: gift.description,
      cost: gift.cost,
      category: gift.category,
      icon: gift.icon,
      isCustom: true,
      createdBy: gift.created_by,
      createdAt: gift.created_at
    }));

    res.json({
      success: true,
      custom_gifts: gifts
    });

  } catch (error) {
    logDbError('Get custom gifts error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法獲取自訂禮品', error));
  }
});

// Create new custom gift
router.post('/', [
  body('title')
    .isLength({ min: 1, max: 100 })
    .withMessage('標題必須在1-100個字符之間'),
  body('description')
    .isLength({ min: 1, max: 500 })
    .withMessage('描述必須在1-500個字符之間'),
  body('cost')
    .isInt({ min: 1, max: 10000 })
    .withMessage('花費必須是1-10000之間的整數'),
  body('category')
    .isIn(['service', 'experience', 'physical', 'intimate'])
    .withMessage('無效的禮品類別'),
  body('icon')
    .optional()
    .isLength({ min: 1, max: 10 })
    .withMessage('圖標不能超過10個字符')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

    const { title, description, cost, category, icon = '🎁' } = req.body;
    const userId = req.user.id;

    // Find user's couple (optional - users can create personal gifts)
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    // Use couple_id if exists, otherwise null for personal gifts
    const coupleId = coupleResult.rows.length > 0 ? coupleResult.rows[0].id : null;

    // Insert custom gift
    const giftResult = await db.query(`
      INSERT INTO custom_gifts (
        couple_id, title, description, cost, category, icon, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, title, description, cost, category, icon, created_by, created_at
    `, [coupleId, title, description, cost, category, icon, userId]);

    const gift = giftResult.rows[0];

    notifyPartnerAction({
      actorId: userId,
      type: 'custom_gift_created',
      content: gift.title ? `${gift.icon || '🎁'} ${gift.title}` : null,
    });

    res.json({
      success: true,
      message: '禮品創建成功',
      custom_gift: {
        id: gift.id,
        title: gift.title,
        description: gift.description,
        cost: gift.cost,
        category: gift.category,
        icon: gift.icon,
        isCustom: true,
        createdBy: gift.created_by,
        createdAt: gift.created_at
      }
    });

  } catch (error) {
    logDbError('Create custom gift error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('創建禮品失敗', error));
  }
});

// Update custom gift
router.put('/:id', [
  body('title')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('標題必須在1-100個字符之間'),
  body('description')
    .optional()
    .isLength({ min: 1, max: 500 })
    .withMessage('描述必須在1-500個字符之間'),
  body('cost')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('花費必須是1-10000之間的整數'),
  body('category')
    .optional()
    .isIn(['service', 'experience', 'physical', 'intimate'])
    .withMessage('無效的禮品類別'),
  body('icon')
    .optional()
    .isLength({ min: 1, max: 10 })
    .withMessage('圖標不能超過10個字符')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

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
      return res.status(404).json({
        success: false,
        message: '找不到禮品或無權限修改'
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
        message: '沒有提供有效的更新字段'
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

    notifyPartnerAction({
      actorId: userId,
      type: 'custom_gift_updated',
      content: gift.title ? `${gift.icon || '🎁'} ${gift.title}` : null,
    });

    res.json({
      success: true,
      message: '禮品更新成功',
      custom_gift: {
        id: gift.id,
        title: gift.title,
        description: gift.description,
        cost: gift.cost,
        category: gift.category,
        icon: gift.icon,
        isCustom: true,
        createdBy: gift.created_by,
        createdAt: gift.created_at
      }
    });

  } catch (error) {
    logError('Update custom gift failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新禮品失敗'
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
      return res.status(404).json({
        success: false,
        message: '找不到禮品或無權限刪除'
      });
    }

    await db.query('DELETE FROM custom_gifts WHERE id = $1', [giftId]);

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
      message: '刪除禮品失敗'
    });
  }
});

module.exports = router;