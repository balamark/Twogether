const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const pairingService = require('../services/pairingService');

const router = express.Router();

// All couple routes require authentication
router.use(authenticateToken);

// Create or join couple
router.post('/', [
  body('couple_name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('情侶名稱不能超過100個字符'),
  body('anniversary_date')
    .optional()
    .isISO8601()
    .withMessage('請輸入有效的日期格式'),
  body('pairing_code')
    .optional()
    .isLength({ min: 6, max: 8 })
    .withMessage('配對碼必須是6-8個字符'),
  body('pairingCode')
    .optional()
    .isLength({ min: 6, max: 8 })
    .withMessage('配對碼必須是6-8個字符')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn(`❌ Validation failed for couple creation by user ${req.user?.id}:`, errors.array());
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

    const { couple_name, anniversary_date } = req.body;
    const pairing_code = req.body.pairing_code || req.body.pairingCode;
    const userId = req.user.id;
    
    console.info(`💕 User ${userId} attempting to ${pairing_code ? 'join couple with code' : 'create new couple'}`);
    if (pairing_code) {
      console.info(`🔗 Pairing code: ${pairing_code}`);
    }

    if (pairing_code) {
      // Pair using unified invite flow
      const result = await pairingService.acceptPairingInviteByCode({
        code: pairing_code,
        accepter: req.user
      });

      if (result.requiresAuth) {
        return res.status(401).json({
          success: false,
          message: '請先登入以完成配對',
          error_code: 'AUTH_REQUIRED'
        });
      }

      const coupleResult = await db.query(`
        SELECT 
          c.id, c.couple_name, c.anniversary_date, c.created_at, c.pending_conflicts,
          u1.id as user1_id, u1.nickname as user1_nickname,
          u2.id as user2_id, u2.nickname as user2_nickname
        FROM couples c
        JOIN users u1 ON c.user1_id = u1.id
        LEFT JOIN users u2 ON c.user2_id = u2.id
        WHERE c.id = $1
      `, [result.coupleId]);

      console.log(`✅ User ${userId} joined couple ${result.coupleId} with pairing code`);

      return res.status(201).json({
        success: true,
        message: '成功加入情侶關係',
        couple: coupleResult.rows[0],
        autoResolved: result.autoResolved,
        pendingConflicts: result.pendingConflicts
      });

    } else {
      // Check for existing couples (complete or draft)
      const existingCouple = await db.query(
        'SELECT id, user2_id FROM couples WHERE user1_id = $1 OR user2_id = $1 ORDER BY created_at DESC',
        [userId]
      );

      if (existingCouple.rows.length > 0) {
        const complete = existingCouple.rows.find((row) => row.user2_id);
        if (complete) {
          console.warn(`⚠️ User ${userId} already has a complete couple relationship: ${complete.id}`);
          return res.status(409).json({
            success: false,
            message: '您已經在一個情侶關係中',
            error_code: 'ALREADY_IN_COUPLE'
          });
        }

        const draftId = existingCouple.rows[0].id;
        const draftResult = await db.query(`
          SELECT 
            c.id, c.couple_name, c.anniversary_date, c.created_at,
            u1.id as user1_id, u1.nickname as user1_nickname,
            u2.id as user2_id, u2.nickname as user2_nickname
          FROM couples c
          JOIN users u1 ON c.user1_id = u1.id
          LEFT JOIN users u2 ON c.user2_id = u2.id
          WHERE c.id = $1
        `, [draftId]);

        return res.status(200).json({
          success: true,
          message: '已有未完成的情侶關係',
          couple: draftResult.rows[0]
        });
      }

      // Create new couple
      const coupleId = uuidv4();
      const now = new Date().toISOString();

      const result = await db.query(`
        INSERT INTO couples (id, user1_id, couple_name, anniversary_date, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, couple_name, anniversary_date, created_at
      `, [coupleId, userId, couple_name || null, anniversary_date || null, now]);

      const couple = result.rows[0];

      console.log(`✅ New couple created: ${coupleId}`);

      res.status(201).json({
        success: true,
        message: '情侶關係創建成功',
        couple: {
          id: couple.id,
          couple_name: couple.couple_name,
          anniversary_date: couple.anniversary_date,
          user1_id: userId,
          user1_nickname: req.user.nickname,
          user2_id: null,
          user2_nickname: null,
          created_at: couple.created_at
        }
      });
    }

  } catch (error) {
    console.error('Create couple error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || '創建情侶關係失敗',
      error_code: error.error_code
    });
  }
});

// Generate pairing code (alternative endpoint for frontend compatibility)
router.post('/pairing-code', async (req, res) => {
  try {
    const userId = req.user.id;
    console.info(`🔗 User ${userId} requesting pairing code generation`);

    const invitation = await pairingService.createPairingInvite({
      senderId: userId,
      senderEmail: req.user.email,
      type: 'code'
    });

    res.json({
      success: true,
      code: invitation.shortCode,
      token: invitation.token,
      expires_at: invitation.expiresAt
    });
  } catch (error) {
    console.error('Generate pairing code error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || '生成配對碼失敗',
      error_code: error.error_code
    });
  }
});

// Generate pairing code
router.post('/generate-pairing-code', async (req, res) => {
  req.url = '/pairing-code';
  return router.handle(req, res);
});

// Get couple info - primary endpoint that frontend calls
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    console.info(`👫 Getting couple info for user ${userId}`);

    const result = await db.query(`
      SELECT
        c.id, c.couple_name, c.anniversary_date, c.created_at, c.pending_conflicts,
        c.first_meet_date, c.first_date, c.first_kiss_date, c.first_kiss_place, c.first_intimacy_date, c.first_intimacy_place,
        u1.id as user1_id, u1.nickname as user1_nickname,
        u2.id as user2_id, u2.nickname as user2_nickname
      FROM couples c
      JOIN users u1 ON c.user1_id = u1.id
      LEFT JOIN users u2 ON c.user2_id = u2.id
      WHERE c.user1_id = $1 OR c.user2_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      console.info(`📝 User ${userId} has no couple relationship yet`);
      return res.status(200).json({
        success: true,
        message: '您還沒有情侶關係',
        error_code: 'NO_COUPLE_RELATIONSHIP',
        user_has_relationship: false,
        couple: null
      });
    }

    const couple = result.rows[0];
    
    // Check if the couple is complete (has both users)
    if (!couple.user2_id) {
      console.info(`📝 User ${userId} has incomplete couple ${couple.id} - waiting for partner`);
      return res.json({
        success: true,
        couple: {
          ...couple,
          is_complete: false,
          waiting_for_partner: true
        }
      });
    }

    console.info(`✅ User ${userId} has complete couple ${couple.id}`);
    res.json({
      success: true,
      couple: {
        ...couple,
        is_complete: true,
        waiting_for_partner: false
      }
    });

  } catch (error) {
    console.error('Get couple error:', error);
    res.status(500).json({
      success: false,
      message: '獲取情侶信息失敗'
    });
  }
});

// Get couple info - alternative endpoint for compatibility
router.get('/me', async (req, res) => {
  // Redirect to the main endpoint to avoid code duplication
  req.url = '/';
  return router.handle(req, res);
});

// Update couple journey information
router.put('/journey', [
  body('anniversary_date').optional().isISO8601(),
  body('first_meet_date').optional().isISO8601(),
  body('first_date').optional().isISO8601(),
  body('first_kiss_date').optional().isISO8601(),
  body('first_kiss_place').optional().isLength({ max: 200 }),
  body('first_intimacy_date').optional().isISO8601(),
  body('first_intimacy_place').optional().isLength({ max: 200 })
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
      anniversary_date,
      first_meet_date,
      first_date,
      first_kiss_date,
      first_kiss_place,
      first_intimacy_date,
      first_intimacy_place
    } = req.body;

    // Find user's couple or create one if it doesn't exist
    let coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    let coupleId;
    if (coupleResult.rows.length === 0) {
      // Create a new couple for this user
      coupleId = uuidv4();
      const now = new Date().toISOString();

      await db.query(`
        INSERT INTO couples (id, user1_id, created_at)
        VALUES ($1, $2, $3)
      `, [coupleId, userId, now]);

      console.log(`✅ Created new couple ${coupleId} for user ${userId} during journey update`);
    } else {
      coupleId = coupleResult.rows[0].id;
    }

    // Update couple journey information
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (anniversary_date !== undefined) {
      updateFields.push(`anniversary_date = $${paramIndex++}`);
      updateValues.push(anniversary_date);
    }
    if (first_meet_date !== undefined) {
      updateFields.push(`first_meet_date = $${paramIndex++}`);
      updateValues.push(first_meet_date);
    }
    if (first_date !== undefined) {
      updateFields.push(`first_date = $${paramIndex++}`);
      updateValues.push(first_date);
    }
    if (first_kiss_date !== undefined) {
      updateFields.push(`first_kiss_date = $${paramIndex++}`);
      updateValues.push(first_kiss_date);
    }
    if (first_kiss_place !== undefined) {
      updateFields.push(`first_kiss_place = $${paramIndex++}`);
      updateValues.push(first_kiss_place);
    }
    if (first_intimacy_date !== undefined) {
      updateFields.push(`first_intimacy_date = $${paramIndex++}`);
      updateValues.push(first_intimacy_date);
    }
    if (first_intimacy_place !== undefined) {
      updateFields.push(`first_intimacy_place = $${paramIndex++}`);
      updateValues.push(first_intimacy_place);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: '沒有提供要更新的欄位'
      });
    }

    updateValues.push(coupleId);

    await db.query(
      `UPDATE couples SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      updateValues
    );

    console.log(`✅ Couple journey updated for couple ${coupleId}`);

    res.json({
      success: true,
      message: '情侶旅程更新成功'
    });

  } catch (error) {
    console.error('Update couple journey error:', error);
    res.status(500).json({
      success: false,
      message: '更新情侶旅程失敗'
    });
  }
});

// Update user's own nickname only
router.put('/nicknames', [
  body('nickname')
    .isLength({ min: 2, max: 50 })
    .withMessage('暱稱必須在2-50個字符之間')
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
    const { nickname } = req.body;

    // Validate and sanitize input
    const validNickname = nickname && typeof nickname === 'string' && nickname.trim() && nickname !== 'undefined' ? nickname.trim() : null;

    if (!validNickname) {
      return res.status(400).json({
        success: false,
        message: '請提供有效的暱稱'
      });
    }

    console.info(`💑 User ${userId} updating their nickname to: ${validNickname}`);

    // Update the calling user's nickname only
    await db.query(
      'UPDATE users SET nickname = $1 WHERE id = $2',
      [validNickname, userId]
    );
    console.info(`✅ Updated user ${userId} nickname to: ${validNickname}`);

    res.json({
      success: true,
      message: '暱稱更新成功'
    });

  } catch (error) {
    console.error('Update nickname error:', error);
    res.status(500).json({
      success: false,
      message: '更新暱稱失敗'
    });
  }
});

module.exports = router;
