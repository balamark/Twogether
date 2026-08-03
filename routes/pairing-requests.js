const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const emailService = require('../services/emailService');
const pairingService = require('../services/pairingService');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();

const handleRouteError = (res, error, fallbackMessage) => {
  const status = error.status || 500;
  return res.status(status).json({
    success: false,
    message: error.message || fallbackMessage,
    error_code: error.error_code
  });
};

const handleCreateInvite = async (req, res, typeOverride = null) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

    const { recipientEmail, message, type } = req.body;
    const senderId = req.user.id;
    const senderName = req.user.nickname;
    const senderEmail = req.user.email;
    const inviteType = typeOverride || type || 'email';

    logInfo('Creating pairing invite', { senderId, senderName, inviteType });

    const invitation = await pairingService.createPairingInvite({
      senderId,
      senderEmail,
      recipientEmail,
      message,
      type: inviteType
    });

    if (inviteType === 'email') {
      try {
        if (emailService.isConfigured()) {
          await emailService.sendPairingInvitation({
            senderName,
            senderEmail,
            recipientEmail,
            token: invitation.token,
            customMessage: message,
          });
          logInfo('Pairing invitation email sent', { kind: 'pairing_invite' });
        } else {
          logWarn('Email service not configured; invitation saved without email', { kind: 'pairing_invite' });
        }
      } catch (emailError) {
        logError('Failed to send pairing invitation email', { kind: 'pairing_invite', err: emailError.message, code: emailError.code });
        // Continue execution - invitation is saved even if email fails
      }
    }

    return res.status(201).json({
      success: true,
      message: '配對邀請已發送',
      invitation: {
        id: invitation.id,
        token: invitation.token,
        shortCode: invitation.shortCode,
        recipientEmail: invitation.recipientEmail,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        emailSent: inviteType === 'email' && emailService.isConfigured()
      }
    });
  } catch (error) {
    logError('Create pairing invitation failed', { err: error.message, stack: error.stack });
    return handleRouteError(res, error, '發送配對邀請失敗');
  }
};

// Create pairing invitation (email or code)
router.post('/', [
  authenticateToken,
  body('type')
    .optional()
    .isIn(['email', 'code'])
    .withMessage('邀請類型必須是 email 或 code'),
  body('recipientEmail')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('請輸入有效的電子郵件地址'),
  body('message')
    .optional()
    .isLength({ max: 500 })
    .withMessage('個人訊息不能超過500個字符')
], async (req, res) => handleCreateInvite(req, res));

// Send pairing invitation via email (legacy endpoint)
router.post('/send-invitation', [
  authenticateToken,
  body('recipientEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('請輸入有效的電子郵件地址'),
  body('message')
    .optional()
    .isLength({ max: 500 })
    .withMessage('個人訊息不能超過500個字符')
], async (req, res) => handleCreateInvite(req, res, 'email'));

// Accept pairing invitation by token
router.post('/accept/:token', optionalAuth, async (req, res) => {
  try {
    const { token } = req.params;
    const result = await pairingService.acceptPairingInviteByToken({ token, accepter: req.user });

    if (result.requiresAuth) {
      return res.json({
        success: true,
        requiresAuth: true,
        invitation: result.invitation,
        message: '請先登入或註冊以接受配對邀請'
      });
    }

    // Send notification email to original sender
    try {
      if (emailService.isConfigured() && result.senderEmail) {
        await emailService.sendPairingAccepted(result.senderEmail, req.user.nickname);
      }
    } catch (emailError) {
      logError('Failed to send pairing accepted email', { kind: 'pairing_accepted', err: emailError.message, code: emailError.code });
    }

    return res.json({
      success: true,
      message: '配對成功！歡迎加入 Twogether',
      couple: {
        id: result.coupleId,
        partnerNickname: result.partnerNickname,
        createdAt: result.createdAt
      },
      autoResolved: result.autoResolved,
      pendingConflicts: result.pendingConflicts
    });
  } catch (error) {
    logError('Accept pairing invitation failed', { err: error.message, stack: error.stack });
    return handleRouteError(res, error, '接受配對邀請失敗');
  }
});

// Accept pairing invitation by short code
router.post('/accept-code', optionalAuth, [
  body('code')
    .notEmpty()
    .withMessage('請輸入配對碼')
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

    const { code } = req.body;
    const result = await pairingService.acceptPairingInviteByCode({ code, accepter: req.user });

    if (result.requiresAuth) {
      return res.json({
        success: true,
        requiresAuth: true,
        invitation: result.invitation,
        message: '請先登入或註冊以接受配對邀請'
      });
    }

    return res.json({
      success: true,
      message: '配對成功！歡迎加入 Twogether',
      couple: {
        id: result.coupleId,
        partnerNickname: result.partnerNickname,
        createdAt: result.createdAt
      },
      autoResolved: result.autoResolved,
      pendingConflicts: result.pendingConflicts
    });
  } catch (error) {
    // If the code was already used (race condition: both users submitted simultaneously),
    // check whether the current user is now in a couple — if so, treat it as success.
    if (req.user && ['INVITATION_NOT_FOUND', 'ALREADY_IN_COUPLE', 'SENDER_ALREADY_PAIRED'].includes(error.error_code)) {
      try {
        const coupleCheck = await db.query(
          `SELECT c.id, u.nickname as partner_nickname
           FROM couples c
           JOIN users u ON (u.id = CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END)
           WHERE (c.user1_id = $1 OR c.user2_id = $1) AND c.user2_id IS NOT NULL`,
          [req.user.id]
        );
        if (coupleCheck.rows.length > 0) {
          return res.json({
            success: true,
            alreadyPaired: true,
            message: '你們已成功配對！',
            couple: {
              id: coupleCheck.rows[0].id,
              partnerNickname: coupleCheck.rows[0].partner_nickname
            }
          });
        }
      } catch (checkError) {
        logError('Already-paired check failed', { err: checkError.message });
      }
    }
    logError('Accept pairing code failed', { err: error.message, stack: error.stack });
    return handleRouteError(res, error, '接受配對邀請失敗');
  }
});

// Reject pairing invitation
router.post('/reject/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find and update the invitation
    const result = await db.query(
      'UPDATE pairing_requests SET status = $1, responded_at = $2 WHERE token = $3 AND status = $4 RETURNING id',
      ['rejected', new Date(), token, 'pending']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '配對邀請不存在或已處理',
        error_code: 'INVITATION_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: '已拒絕配對邀請'
    });

  } catch (error) {
    logError('Reject pairing invitation failed', { err: error.message, stack: error.stack });
    return handleRouteError(res, error, '拒絕配對邀請失敗');
  }
});

const handleGetInvite = async (req, res) => {
  try {
    const { token } = req.params;
    const invitation = await pairingService.getPairingInvite(token);
    return res.json({
      success: true,
      invitation
    });
  } catch (error) {
    logError('Get invitation details failed', { err: error.message, stack: error.stack });
    return handleRouteError(res, error, '無法獲取邀請詳情');
  }
};

// Legacy invite details route
router.get('/invitation/:token', handleGetInvite);

// Cancel invitation
router.post('/:token/cancel', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      'UPDATE pairing_requests SET status = $1 WHERE token = $2 AND sender_id = $3 AND status = $4 RETURNING id',
      ['expired', token, userId, 'pending']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到可取消的邀請',
        error_code: 'INVITATION_NOT_FOUND'
      });
    }

    return res.json({
      success: true,
      message: '已取消配對邀請'
    });
  } catch (error) {
    logError('Cancel invitation failed', { err: error.message, stack: error.stack });
    return handleRouteError(res, error, '取消配對邀請失敗');
  }
});

// Resend invitation email
router.post('/:token/resend', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.id;

    const result = await db.query(`
      SELECT pr.recipient_email, pr.message, u.nickname as sender_nickname, u.email as sender_email
      FROM pairing_requests pr
      JOIN users u ON pr.sender_id = u.id
      WHERE pr.token = $1 AND pr.sender_id = $2 AND pr.status = 'pending' AND pr.type = 'email'
    `, [token, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到可重新發送的邀請',
        error_code: 'INVITATION_NOT_FOUND'
      });
    }

    if (!emailService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: '郵件服務尚未設定',
        error_code: 'EMAIL_NOT_CONFIGURED'
      });
    }

    const invite = result.rows[0];
    await emailService.sendPairingInvitation({
      senderName: invite.sender_nickname,
      senderEmail: invite.sender_email,
      recipientEmail: invite.recipient_email,
      token,
      customMessage: invite.message,
    });

    return res.json({
      success: true,
      message: '邀請已重新發送'
    });
  } catch (error) {
    logError('Resend invitation failed', { err: error.message, stack: error.stack });
    return handleRouteError(res, error, '重新發送邀請失敗');
  }
});

// Get user's sent invitations (authenticated endpoint)
router.get('/my-invitations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(`
      SELECT id, recipient_email, message, status, created_at, expires_at, type, short_code
      FROM pairing_requests
      WHERE sender_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    res.json({
      success: true,
      invitations: result.rows
    });

  } catch (error) {
    logError('Get my invitations failed', { err: error.message, stack: error.stack });
    return handleRouteError(res, error, '無法獲取邀請列表');
  }
});

// Get invitation details by token (new endpoint)
router.get('/:token', handleGetInvite);

module.exports = router;
