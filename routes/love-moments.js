const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All love moment routes require authentication
router.use(authenticateToken);

// Create love moment
router.post('/', [
  body('moment_date')
    .isISO8601()
    .withMessage('請輸入有效的日期時間格式'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('備註不能超過1000個字符'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('描述不能超過500個字符'),
  body('duration')
    .optional()
    .isLength({ max: 50 })
    .withMessage('持續時間不能超過50個字符'),
  body('location')
    .optional()
    .isLength({ max: 200 })
    .withMessage('地點不能超過200個字符'),
  body('roleplay_script')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('角色扮演劇本不能超過2000個字符')
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

    const userId = req.user.id;
    const {
      moment_date,
      notes,
      description,
      duration,
      location,
      roleplay_script,
      photo_id
    } = req.body;

    // Find user's couple (optional - users can record even when unpaired)
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    // Allow unpaired users to create records - they can pair later
    const coupleId = coupleResult.rows.length > 0 ? coupleResult.rows[0].id : null;

    // Create love moment
    const momentId = uuidv4();
    const now = new Date().toISOString();

    const result = await db.query(`
      INSERT INTO love_moments (
        id, couple_id, recorded_by, moment_date, notes, description,
        duration, location, roleplay_script, photo_id, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, moment_date, notes, description, duration, location, roleplay_script, photo_id, created_at
    `, [
      momentId, coupleId, userId, moment_date, notes || null, description || null,
      duration || null, location || null, roleplay_script || null, photo_id || null, now
    ]);

    const moment = result.rows[0];

    console.log(`✅ Love moment created: ${momentId} for couple ${coupleId}`);

    res.status(201).json({
      success: true,
      message: '愛情時刻記錄成功',
      love_moment: {
        ...moment,
        recorded_by: {
          id: userId,
          nickname: req.user.nickname
        }
      }
    });

  } catch (error) {
    console.error('Create love moment error:', error);
    res.status(500).json({
      success: false,
      message: '記錄愛情時刻失敗'
    });
  }
});

// Get love moments for couple
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, month } = req.query;
    
    const offset = (page - 1) * limit;

    // Find user's couple (optional for unpaired users)
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    const coupleId = coupleResult.rows.length > 0 ? coupleResult.rows[0].id : null;

    // Build query to include both couple records and individual records
    let whereClause, queryParams;
    let paramIndex = 2;

    if (coupleId) {
      // User has a couple - show both couple records and their individual records
      whereClause = 'WHERE (lm.couple_id = $1 OR (lm.couple_id IS NULL AND lm.recorded_by = $2))';
      queryParams = [coupleId, userId];
      paramIndex = 3;
    } else {
      // User has no couple - only show their individual records
      whereClause = 'WHERE lm.couple_id IS NULL AND lm.recorded_by = $1';
      queryParams = [userId];
    }

    if (month) {
      whereClause += ` AND DATE_TRUNC('month', lm.moment_date) = $${paramIndex}::date`;
      queryParams.push(month + '-01');
      paramIndex++;
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM love_moments lm ${whereClause}`,
      queryParams
    );
    const total = parseInt(countResult.rows[0].total);

    // Get love moments with user info
    queryParams.push(parseInt(limit), offset);
    
    const result = await db.query(`
      SELECT 
        lm.id, lm.moment_date, lm.notes, lm.description, lm.duration,
        lm.location, lm.roleplay_script, lm.photo_id, lm.created_at,
        u.id as recorded_by_id, u.nickname as recorded_by_nickname
      FROM love_moments lm
      JOIN users u ON lm.recorded_by = u.id
      ${whereClause}
      ORDER BY lm.moment_date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, queryParams);

    const loveMoments = result.rows.map(row => ({
      id: row.id,
      moment_date: row.moment_date,
      notes: row.notes,
      description: row.description,
      duration: row.duration,
      location: row.location,
      roleplay_script: row.roleplay_script,
      photo_id: row.photo_id,
      created_at: row.created_at,
      recorded_by: {
        id: row.recorded_by_id,
        nickname: row.recorded_by_nickname
      }
    }));

    res.json({
      success: true,
      love_moments: loveMoments,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (error) {
    console.error('Get love moments error:', error);
    res.status(500).json({
      success: false,
      message: '獲取愛情時刻失敗'
    });
  }
});

// Get love moment by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const momentId = req.params.id;

    const result = await db.query(`
      SELECT
        lm.id, lm.moment_date, lm.notes, lm.description, lm.duration,
        lm.location, lm.roleplay_script, lm.photo_id, lm.created_at,
        u.id as recorded_by_id, u.nickname as recorded_by_nickname,
        c.id as couple_id
      FROM love_moments lm
      JOIN users u ON lm.recorded_by = u.id
      LEFT JOIN couples c ON lm.couple_id = c.id
      WHERE lm.id = $1 AND (
        lm.recorded_by = $2 OR
        (c.id IS NOT NULL AND (c.user1_id = $2 OR c.user2_id = $2))
      )
    `, [momentId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的愛情時刻'
      });
    }

    const moment = result.rows[0];

    res.json({
      success: true,
      love_moment: {
        id: moment.id,
        moment_date: moment.moment_date,
        notes: moment.notes,
        description: moment.description,
        duration: moment.duration,
        location: moment.location,
        roleplay_script: moment.roleplay_script,
        photo_id: moment.photo_id,
        created_at: moment.created_at,
        recorded_by: {
          id: moment.recorded_by_id,
          nickname: moment.recorded_by_nickname
        }
      }
    });

  } catch (error) {
    console.error('Get love moment error:', error);
    res.status(500).json({
      success: false,
      message: '獲取愛情時刻失敗'
    });
  }
});

// Update love moment
router.put('/:id', [
  body('moment_date')
    .optional()
    .isISO8601()
    .withMessage('請輸入有效的日期時間格式'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('備註不能超過1000個字符'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('描述不能超過500個字符'),
  body('duration')
    .optional()
    .isLength({ max: 50 })
    .withMessage('持續時間不能超過50個字符'),
  body('location')
    .optional()
    .isLength({ max: 200 })
    .withMessage('地點不能超過200個字符'),
  body('roleplay_script')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('角色扮演劇本不能超過2000個字符')
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

    const userId = req.user.id;
    const momentId = req.params.id;

    // Check if user owns this love moment
    const ownershipResult = await db.query(`
      SELECT lm.id FROM love_moments lm
      LEFT JOIN couples c ON lm.couple_id = c.id
      WHERE lm.id = $1 AND (
        lm.recorded_by = $2 OR
        (c.id IS NOT NULL AND (c.user1_id = $2 OR c.user2_id = $2))
      )
    `, [momentId, userId]);

    if (ownershipResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的愛情時刻或您沒有權限修改'
      });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    const allowedFields = [
      'moment_date', 'notes', 'description', 'duration',
      'location', 'roleplay_script', 'photo_id'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields.push(`${field} = $${paramIndex++}`);
        updateValues.push(req.body[field]);
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: '沒有提供要更新的欄位'
      });
    }

    updateValues.push(momentId);

    await db.query(
      `UPDATE love_moments SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      updateValues
    );

    console.log(`✅ Love moment updated: ${momentId}`);

    res.json({
      success: true,
      message: '愛情時刻更新成功'
    });

  } catch (error) {
    console.error('Update love moment error:', error);
    res.status(500).json({
      success: false,
      message: '更新愛情時刻失敗'
    });
  }
});

// Delete love moment
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const momentId = req.params.id;

    // Check ownership and delete
    const result = await db.query(`
      DELETE FROM love_moments
      WHERE id = $1 AND (
        recorded_by = $2 OR
        couple_id IN (
          SELECT id FROM couples WHERE user1_id = $2 OR user2_id = $2
        )
      )
      RETURNING id
    `, [momentId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的愛情時刻或您沒有權限刪除'
      });
    }

    console.log(`✅ Love moment deleted: ${momentId}`);

    res.json({
      success: true,
      message: '愛情時刻刪除成功'
    });

  } catch (error) {
    console.error('Delete love moment error:', error);
    res.status(500).json({
      success: false,
      message: '刪除愛情時刻失敗'
    });
  }
});

module.exports = router;
