const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { logInfo, logError } = require('../lib/logger');

const router = express.Router();

// Register new user
router.post('/register', [
  body('nickname')
    .isLength({ min: 2, max: 50 })
    .withMessage('暱稱必須在2-50個字符之間'),
  body('email')
    .isEmail()
    .withMessage('請輸入有效的電子郵件地址'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('密碼至少需要6個字符')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

    const { nickname, email, password } = req.body;

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: '此電子郵件已被註冊'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const userId = uuidv4();
    const now = new Date().toISOString();

    const result = await db.query(
      `INSERT INTO users (id, nickname, email, password_hash, created_at, last_login)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nickname, email, created_at`,
      [userId, nickname, email, passwordHash, now, now]
    );

    const user = result.rows[0];

    // Generate token
    const { token, expiresAt } = generateToken(user.id);

    logInfo('User registered', { email });

    res.status(201).json({
      success: true,
      message: '註冊成功',
      token,
      tokenExpiresAt: expiresAt,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        created_at: user.created_at
      }
    });

  } catch (error) {
    logError('Registration failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '註冊失敗，請稍後再試'
    });
  }
});

// Login user
router.post('/login', [
  body('email')
    .isEmail()
    .withMessage('請輸入有效的電子郵件地址'),
  body('password')
    .notEmpty()
    .withMessage('請輸入密碼')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const userResult = await db.query(
      'SELECT id, nickname, email, gender, password_hash, created_at FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: '電子郵件或密碼錯誤'
      });
    }

    const user = userResult.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: '電子郵件或密碼錯誤'
      });
    }

    // Update last login
    await db.query(
      'UPDATE users SET last_login = $1 WHERE id = $2',
      [new Date().toISOString(), user.id]
    );

    // Generate token
    const { token, expiresAt } = generateToken(user.id);

    logInfo('User logged in', { email });

    res.json({
      success: true,
      message: '登入成功',
      token,
      tokenExpiresAt: expiresAt,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        gender: user.gender,
        created_at: user.created_at
      }
    });

  } catch (error) {
    logError('Login failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '登入失敗，請稍後再試'
    });
  }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Get user with couple information
    const userResult = await db.query(`
      SELECT
        u.id, u.nickname, u.email, u.gender, u.email_notifications_enabled,
        u.created_at, u.last_login,
        c.id as couple_id, c.couple_name, c.anniversary_date,
        c.user1_id, c.user2_id
      FROM users u
      LEFT JOIN couples c ON (c.user1_id = u.id OR c.user2_id = u.id)
      WHERE u.id = $1
    `, [req.user.id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用戶不存在'
      });
    }

    const userData = userResult.rows[0];
    
    // If user has a couple, get partner information
    let partner = null;
    if (userData.couple_id) {
      const partnerId = userData.user1_id === req.user.id ? userData.user2_id : userData.user1_id;
      if (partnerId) {
        const partnerResult = await db.query(
          'SELECT id, nickname, email FROM users WHERE id = $1',
          [partnerId]
        );
        if (partnerResult.rows.length > 0) {
          partner = partnerResult.rows[0];
        }
      }
    }

    res.json({
      success: true,
      user: {
        id: userData.id,
        nickname: userData.nickname,
        email: userData.email,
        gender: userData.gender,
        email_notifications_enabled: userData.email_notifications_enabled !== false,
        created_at: userData.created_at,
        last_login: userData.last_login,
        couple: userData.couple_id ? {
          id: userData.couple_id,
          couple_name: userData.couple_name,
          anniversary_date: userData.anniversary_date,
          partner: partner
        } : null
      }
    });

  } catch (error) {
    logError('Get user info failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取用戶信息失敗'
    });
  }
});

// Update user gender
router.put('/user/gender', authenticateToken, [
  body('gender')
    .isIn(['male', 'female', 'other'])
    .withMessage('性別必須是 male、female 或 other')
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
    const { gender } = req.body;

    logInfo('Updating user gender', { userId, gender });

    // Update user gender in database
    await db.query(`
      UPDATE users
      SET gender = $1
      WHERE id = $2
    `, [gender, userId]);

    logInfo('User gender updated', { userId });

    res.json({
      success: true,
      message: '性別設定已更新',
      gender: gender
    });

  } catch (error) {
    logError('Update user gender failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新性別設定失敗'
    });
  }
});

// Toggle per-user opt-out for partner-activity email notifications.
router.put('/user/email-notifications', authenticateToken, [
  body('email_notifications_enabled')
    .isBoolean()
    .withMessage('email_notifications_enabled 必須為布林值')
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
    const enabled = !!req.body.email_notifications_enabled;

    await db.query(
      `UPDATE users SET email_notifications_enabled = $1 WHERE id = $2`,
      [enabled, userId]
    );

    res.json({
      success: true,
      message: '電子郵件通知設定已更新',
      email_notifications_enabled: enabled
    });
  } catch (error) {
    logError('Update email notifications pref failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新電子郵件通知設定失敗'
    });
  }
});

module.exports = router;
