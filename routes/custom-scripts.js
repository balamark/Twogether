const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All custom script routes require authentication
router.use(authenticateToken);

// Get custom scripts for user's couple
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Find user's couple
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    if (coupleResult.rows.length === 0) {
      return res.json({
        success: true,
        custom_scripts: []
      });
    }

    const coupleId = coupleResult.rows[0].id;

    // Get custom scripts for the couple
    const scriptsResult = await db.query(`
      SELECT
        id, title, category, scenario, content, tags, duration,
        created_by, created_at, updated_at
      FROM custom_scripts
      WHERE couple_id = $1
      ORDER BY created_at DESC
    `, [coupleId]);

    const scripts = scriptsResult.rows.map(script => ({
      id: script.id,
      title: script.title,
      category: script.category,
      scenario: script.scenario,
      script: script.content, // Map content to script for frontend compatibility
      tags: script.tags || [],
      duration: script.duration || '15-30分鐘',
      isCustom: true,
      createdBy: script.created_by,
      createdAt: script.created_at
    }));

    res.json({
      success: true,
      custom_scripts: scripts
    });

  } catch (error) {
    console.error('Get custom scripts error:', error);
    res.status(500).json({
      success: false,
      message: '無法獲取自訂劇本'
    });
  }
});

// Create new custom script
router.post('/', [
  body('title')
    .isLength({ min: 1, max: 100 })
    .withMessage('標題必須在1-100個字符之間'),
  body('category')
    .isIn(['romantic', 'adventurous', 'school', 'bold'])
    .withMessage('無效的劇本類別'),
  body('scenario')
    .isLength({ min: 1, max: 500 })
    .withMessage('情境描述必須在1-500個字符之間'),
  body('content')
    .isLength({ min: 1, max: 5000 })
    .withMessage('劇本內容必須在1-5000個字符之間'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('標籤必須是數組格式'),
  body('duration')
    .optional()
    .isLength({ max: 50 })
    .withMessage('時長描述不能超過50個字符')
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

    const { title, category, scenario, content, tags = [], duration = '15-30分鐘' } = req.body;
    const userId = req.user.id;

    // Find user's couple
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    if (coupleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: '您還沒有情侶關係，無法創建劇本'
      });
    }

    const coupleId = coupleResult.rows[0].id;

    // Insert custom script
    const scriptResult = await db.query(`
      INSERT INTO custom_scripts (
        couple_id, title, category, scenario, content, tags, duration, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, title, category, scenario, content, tags, duration, created_by, created_at
    `, [coupleId, title, category, scenario, content, JSON.stringify(tags), duration, userId]);

    const script = scriptResult.rows[0];

    res.json({
      success: true,
      message: '劇本創建成功',
      custom_script: {
        id: script.id,
        title: script.title,
        category: script.category,
        scenario: script.scenario,
        script: script.content,
        tags: JSON.parse(script.tags || '[]'),
        duration: script.duration,
        isCustom: true,
        createdBy: script.created_by,
        createdAt: script.created_at
      }
    });

  } catch (error) {
    console.error('Create custom script error:', error);
    res.status(500).json({
      success: false,
      message: '創建劇本失敗'
    });
  }
});

// Update custom script
router.put('/:id', [
  body('title')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('標題必須在1-100個字符之間'),
  body('category')
    .optional()
    .isIn(['romantic', 'adventurous', 'school', 'bold'])
    .withMessage('無效的劇本類別'),
  body('scenario')
    .optional()
    .isLength({ min: 1, max: 500 })
    .withMessage('情境描述必須在1-500個字符之間'),
  body('content')
    .optional()
    .isLength({ min: 1, max: 5000 })
    .withMessage('劇本內容必須在1-5000個字符之間'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('標籤必須是數組格式'),
  body('duration')
    .optional()
    .isLength({ max: 50 })
    .withMessage('時長描述不能超過50個字符')
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

    const scriptId = req.params.id;
    const userId = req.user.id;
    const updates = req.body;

    // Find user's couple and verify script ownership
    const scriptResult = await db.query(`
      SELECT cs.*, c.user1_id, c.user2_id
      FROM custom_scripts cs
      JOIN couples c ON cs.couple_id = c.id
      WHERE cs.id = $1 AND (c.user1_id = $2 OR c.user2_id = $2)
    `, [scriptId, userId]);

    if (scriptResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到劇本或無權限修改'
      });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (['title', 'category', 'scenario', 'content', 'duration'].includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        updateValues.push(updates[key]);
        paramIndex++;
      } else if (key === 'tags') {
        updateFields.push(`tags = $${paramIndex}`);
        updateValues.push(JSON.stringify(updates[key]));
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
    updateValues.push(scriptId);

    const updateQuery = `
      UPDATE custom_scripts
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, title, category, scenario, content, tags, duration, created_by, created_at, updated_at
    `;

    const updatedResult = await db.query(updateQuery, updateValues);
    const script = updatedResult.rows[0];

    res.json({
      success: true,
      message: '劇本更新成功',
      custom_script: {
        id: script.id,
        title: script.title,
        category: script.category,
        scenario: script.scenario,
        script: script.content,
        tags: JSON.parse(script.tags || '[]'),
        duration: script.duration,
        isCustom: true,
        createdBy: script.created_by,
        createdAt: script.created_at
      }
    });

  } catch (error) {
    console.error('Update custom script error:', error);
    res.status(500).json({
      success: false,
      message: '更新劇本失敗'
    });
  }
});

// Delete custom script
router.delete('/:id', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.user.id;

    // Find user's couple and verify script ownership
    const scriptResult = await db.query(`
      SELECT cs.id
      FROM custom_scripts cs
      JOIN couples c ON cs.couple_id = c.id
      WHERE cs.id = $1 AND (c.user1_id = $2 OR c.user2_id = $2)
    `, [scriptId, userId]);

    if (scriptResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到劇本或無權限刪除'
      });
    }

    await db.query('DELETE FROM custom_scripts WHERE id = $1', [scriptId]);

    res.json({
      success: true,
      message: '劇本刪除成功'
    });

  } catch (error) {
    console.error('Delete custom script error:', error);
    res.status(500).json({
      success: false,
      message: '刪除劇本失敗'
    });
  }
});

module.exports = router;