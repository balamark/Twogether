const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { logInfo, logWarn, logError } = require('../lib/logger');
const { TIMEZONE_VALUES } = require('../lib/timezone-options');
const emailService = require('../services/emailService');

const router = express.Router();

// Opaque URL-safe token for email verification / password reset links.
const makeToken = () => crypto.randomBytes(32).toString('hex');

// Escape a value before embedding it in server-rendered HTML.
const escapeHtml = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

    // Create user. New accounts start unverified (soft verification) with a
    // one-shot token embedded in the welcome email's verify link.
    const userId = uuidv4();
    const now = new Date().toISOString();
    const verifyToken = makeToken();

    const result = await db.query(
      `INSERT INTO users (id, nickname, email, password_hash, created_at, last_login,
                          email_verified, email_verification_token, email_verification_sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7, NOW())
       RETURNING id, nickname, email, created_at`,
      [userId, nickname, email, passwordHash, now, now, verifyToken]
    );

    const user = result.rows[0];

    // Generate token
    const { token, expiresAt } = generateToken(user.id);

    logInfo('User registered', { email });

    // Welcome + verification email. Fire-and-forget: sign-up must succeed even
    // if SMTP is down — the user can resend later from the in-app banner.
    emailService.sendWelcomeEmail({
      recipientEmail: user.email,
      nickname: user.nickname,
      token: verifyToken,
    }).catch((err) => logWarn('Welcome email failed', { err: err.message }));

    res.status(201).json({
      success: true,
      message: '註冊成功',
      token,
      tokenExpiresAt: expiresAt,
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email,
        email_verified: false,
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
      'SELECT id, nickname, email, gender, birth_date, timezone, email_notifications_enabled, cycle_tracking_enabled, email_verified, password_hash, created_at FROM users WHERE email = $1',
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

    // Record the login event for funnel analytics. Non-blocking — if the
    // insert fails we still want the user to be able to log in.
    db.query(
      'INSERT INTO login_events (user_id, ip) VALUES ($1, $2)',
      [user.id, req.ip || null]
    ).catch((err) => {
      logError('login_events insert failed', { err: err.message });
    });

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
        birth_date: user.birth_date,
        timezone: user.timezone,
        email_notifications_enabled: user.email_notifications_enabled !== false,
        cycle_tracking_enabled: user.cycle_tracking_enabled === true,
        email_verified: user.email_verified === true,
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
        u.id, u.nickname, u.email, u.gender, u.birth_date, u.timezone,
        u.email_notifications_enabled,
        u.cycle_tracking_enabled,
        u.email_verified,
        u.created_at, u.last_login,
        c.id as couple_id, c.couple_name, c.anniversary_date, c.primary_timezone,
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
          'SELECT id, nickname, email, timezone FROM users WHERE id = $1',
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
        birth_date: userData.birth_date,
        timezone: userData.timezone,
        email_notifications_enabled: userData.email_notifications_enabled !== false,
        cycle_tracking_enabled: userData.cycle_tracking_enabled === true,
        email_verified: userData.email_verified === true,
        created_at: userData.created_at,
        last_login: userData.last_login,
        couple: userData.couple_id ? {
          id: userData.couple_id,
          couple_name: userData.couple_name,
          anniversary_date: userData.anniversary_date,
          primary_timezone: userData.primary_timezone,
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

// --- Email verification + password reset ---------------------------------

// Minimal self-contained HTML page (no SPA needed) for the links we email.
const authPage = (res, { ok = true, status = 200, emoji, title, message, body = '' }) => {
  res.status(status).type('html').send(`<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Twogether</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif;background:#fbf7f2;color:#2a2422;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.card{background:#fff;border:1px solid #e4dccf;border-radius:14px;padding:36px 32px;max-width:420px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.emoji{font-size:44px}h1{font-size:22px;font-weight:500;margin:14px 0 8px}p{color:#8a807c;font-size:15px;line-height:1.6;margin:0 0 20px}
input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #e4dccf;border-radius:8px;font-size:15px;margin:6px 0}
button,a.btn{display:inline-block;background:#2a2422;color:#fbf7f2;border:0;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;cursor:pointer}</style>
</head><body><div class="card"><div class="emoji">${emoji ?? (ok ? '✅' : '⚠️')}</div>
<h1>${title}</h1><p>${message}</p>${body}</div></body></html>`);
};

// GET /api/auth/verify-email?token=... — confirm a new user's email address.
router.get('/verify-email', async (req, res) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      return authPage(res, { ok: false, status: 400, title: '驗證失敗', message: '驗證連結無效，缺少驗證碼。', body: '<a class="btn" href="/">回到 Twogether</a>' });
    }
    const result = await db.query(
      `UPDATE users
          SET email_verified = true, email_verification_token = NULL
        WHERE email_verification_token = $1
        RETURNING id`,
      [token]
    );
    if (result.rows.length === 0) {
      return authPage(res, { ok: false, status: 400, title: '驗證失敗', message: '這個連結已失效或已使用過。如果你已驗證過，直接登入即可。', body: '<a class="btn" href="/">回到 Twogether</a>' });
    }
    logInfo('User email verified', { userId: result.rows[0].id });
    return authPage(res, { ok: true, title: 'Email 已驗證', message: '謝謝你！你的 Email 已完成驗證，現在可以放心使用 Twogether 了。', body: '<a class="btn" href="/">開始使用 Twogether</a>' });
  } catch (error) {
    logError('User email verification failed', { err: error.message });
    return authPage(res, { ok: false, status: 500, title: '驗證失敗', message: '驗證時發生錯誤，請稍後再試。', body: '<a class="btn" href="/">回到 Twogether</a>' });
  }
});

// POST /api/auth/resend-verification — re-send the verification email. Soft
// rate-limit: at most once per minute. No-op (still 200) if already verified.
router.post('/resend-verification', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT email, nickname, email_verified, email_verification_sent_at FROM users WHERE id = $1',
      [req.user.id]
    );
    const u = result.rows[0];
    if (!u) return res.status(404).json({ success: false, message: '用戶不存在' });
    if (u.email_verified) {
      return res.json({ success: true, message: '你的 Email 已經驗證過了。', alreadyVerified: true });
    }
    if (u.email_verification_sent_at && Date.now() - new Date(u.email_verification_sent_at).getTime() < 60_000) {
      return res.status(429).json({ success: false, message: '剛剛才寄出驗證信，請稍候一分鐘再試。' });
    }
    const verifyToken = makeToken();
    await db.query(
      'UPDATE users SET email_verification_token = $1, email_verification_sent_at = NOW() WHERE id = $2',
      [verifyToken, req.user.id]
    );
    await emailService.sendWelcomeEmail({ recipientEmail: u.email, nickname: u.nickname, token: verifyToken });
    logInfo('Verification email resent', { userId: req.user.id });
    res.json({ success: true, message: '驗證信已重新寄出，請到信箱查收。' });
  } catch (error) {
    logError('Resend verification failed', { err: error.message });
    res.status(500).json({ success: false, message: '重寄驗證信失敗，請稍後再試。' });
  }
});

// POST /api/auth/forgot-password — start a password reset. Always responds
// success so the endpoint can't be used to probe which emails are registered.
router.post('/forgot-password', [
  body('email').isEmail().withMessage('請輸入有效的電子郵件地址'),
], async (req, res) => {
  const genericOk = () => res.json({ success: true, message: '如果這個 Email 有註冊帳號，我們已寄出重設密碼的連結。' });
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: '請輸入有效的電子郵件地址', errors: errors.array() });

    const { email } = req.body;
    const result = await db.query('SELECT id, nickname, email FROM users WHERE email = $1', [email]);
    const u = result.rows[0];
    if (!u) {
      logInfo('Password reset requested for unknown email');
      return genericOk();
    }
    const resetToken = makeToken();
    await db.query(
      `UPDATE users SET password_reset_token = $1, password_reset_expires = NOW() + INTERVAL '1 hour' WHERE id = $2`,
      [resetToken, u.id]
    );
    await emailService.sendPasswordResetEmail({ recipientEmail: u.email, nickname: u.nickname, token: resetToken });
    logInfo('Password reset email sent', { userId: u.id });
    return genericOk();
  } catch (error) {
    logError('Forgot password failed', { err: error.message });
    // Still respond generically — don't leak failures either.
    return genericOk();
  }
});

// GET /api/auth/reset-password?token=... — render the "set a new password" form.
router.get('/reset-password', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    return authPage(res, { ok: false, status: 400, title: '連結無效', message: '重設密碼連結無效，缺少驗證碼。', body: '<a class="btn" href="/">回到 Twogether</a>' });
  }
  const form = `
    <form method="POST" action="/api/auth/reset-password">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <input type="password" name="password" placeholder="新密碼（至少 6 個字元）" minlength="6" required>
      <input type="password" name="confirm" placeholder="再次輸入新密碼" minlength="6" required>
      <button type="submit">設定新密碼</button>
    </form>`;
  return authPage(res, { ok: true, emoji: '🔑', title: '設定新密碼', message: '請輸入你的新密碼。', body: form });
});

// POST /api/auth/reset-password — process the form. Renders an HTML result.
router.post('/reset-password', async (req, res) => {
  try {
    const token = (req.body.token || '').toString();
    const password = (req.body.password || '').toString();
    const confirm = (req.body.confirm || '').toString();

    if (!token || password.length < 6) {
      return authPage(res, { ok: false, status: 400, title: '無法重設', message: '密碼至少需要 6 個字元。', body: '<a class="btn" href="javascript:history.back()">返回</a>' });
    }
    if (confirm !== undefined && confirm !== '' && password !== confirm) {
      return authPage(res, { ok: false, status: 400, title: '無法重設', message: '兩次輸入的密碼不一致。', body: '<a class="btn" href="javascript:history.back()">返回</a>' });
    }

    const result = await db.query(
      `SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
      [token]
    );
    const u = result.rows[0];
    if (!u) {
      return authPage(res, { ok: false, status: 400, title: '連結已失效', message: '這個重設連結已過期或已使用過，請重新申請。', body: '<a class="btn" href="/">回到 Twogether</a>' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.query(
      `UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2`,
      [passwordHash, u.id]
    );
    logInfo('Password reset completed', { userId: u.id });
    return authPage(res, { ok: true, title: '密碼已更新', message: '你的密碼已成功更新，請用新密碼登入。', body: '<a class="btn" href="/">回到 Twogether 登入</a>' });
  } catch (error) {
    logError('Reset password failed', { err: error.message });
    return authPage(res, { ok: false, status: 500, title: '發生錯誤', message: '重設密碼時發生錯誤，請稍後再試。', body: '<a class="btn" href="/">回到 Twogether</a>' });
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

// Toggle per-user opt-in for cycle (period) tracking.
router.put('/user/cycle-tracking', authenticateToken, [
  body('cycle_tracking_enabled')
    .isBoolean()
    .withMessage('cycle_tracking_enabled 必須為布林值')
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
    const enabled = !!req.body.cycle_tracking_enabled;

    await db.query(
      `UPDATE users SET cycle_tracking_enabled = $1 WHERE id = $2`,
      [enabled, userId]
    );

    res.json({
      success: true,
      message: '週期追蹤設定已更新',
      cycle_tracking_enabled: enabled
    });
  } catch (error) {
    logError('Update cycle tracking pref failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新週期追蹤設定失敗'
    });
  }
});

// Update user birth date (used to compute age for health-reference nudges).
// Accepts ISO date string (YYYY-MM-DD) or null to clear.
router.put('/user/birth-date', authenticateToken, [
  body('birth_date')
    .custom((value) => {
      if (value === null) return true;
      if (typeof value !== 'string') throw new Error('birth_date 必須為日期字串或 null');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('birth_date 必須為 YYYY-MM-DD 格式');
      const d = new Date(value + 'T00:00:00Z');
      if (Number.isNaN(d.getTime())) throw new Error('birth_date 無效');
      const year = d.getUTCFullYear();
      const today = new Date();
      if (year < 1900) throw new Error('birth_date 年份太早');
      if (d.getTime() > today.getTime()) throw new Error('birth_date 不可為未來日期');
      return true;
    })
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
    const birthDate = req.body.birth_date === null ? null : req.body.birth_date;

    await db.query(
      `UPDATE users SET birth_date = $1 WHERE id = $2`,
      [birthDate, userId]
    );

    res.json({
      success: true,
      message: '生日已更新',
      birth_date: birthDate
    });
  } catch (error) {
    logError('Update birth date failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新生日失敗'
    });
  }
});

// Update user timezone (IANA string from the curated allow-list).
router.put('/user/timezone', authenticateToken, [
  body('timezone')
    .custom((value) => {
      if (value === null) return true;
      if (typeof value !== 'string') throw new Error('timezone 必須為字串或 null');
      if (!TIMEZONE_VALUES.includes(value)) throw new Error('timezone 不在允許清單中');
      return true;
    })
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
    const timezone = req.body.timezone === null ? null : req.body.timezone;

    await db.query(
      `UPDATE users SET timezone = $1 WHERE id = $2`,
      [timezone, userId]
    );

    res.json({
      success: true,
      message: '時區已更新',
      timezone: timezone
    });
  } catch (error) {
    logError('Update user timezone failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '更新時區失敗'
    });
  }
});

module.exports = router;
