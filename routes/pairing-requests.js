const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const emailService = require('../services/emailService');
const pairingService = require('../services/pairingService');

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

    console.info(`📧 User ${senderId} (${senderName}) creating ${inviteType} pairing invite`);

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
          await emailService.sendPairingInvitation(senderName, recipientEmail, invitation.token, message);
          console.log(`✅ Pairing invitation email sent to ${recipientEmail}`);
        } else {
          console.warn('⚠️ Email service not configured, invitation saved but email not sent');
        }
      } catch (emailError) {
        console.error('❌ Failed to send invitation email:', emailError);
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
    console.error('Create pairing invitation error:', error);
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
      console.error('❌ Failed to send pairing accepted notification:', emailError);
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
    console.error('Accept pairing invitation error:', error);
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
    console.error('Accept pairing code error:', error);
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
    console.error('Reject pairing invitation error:', error);
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
    console.error('Get invitation details error:', error);
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
    console.error('Cancel invitation error:', error);
    return handleRouteError(res, error, '取消配對邀請失敗');
  }
});

// Resend invitation email
router.post('/:token/resend', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.id;

    const result = await db.query(`
      SELECT pr.recipient_email, pr.message, u.nickname as sender_nickname
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
    await emailService.sendPairingInvitation(invite.sender_nickname, invite.recipient_email, token, invite.message);

    return res.json({
      success: true,
      message: '邀請已重新發送'
    });
  } catch (error) {
    console.error('Resend invitation error:', error);
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
    console.error('Get my invitations error:', error);
    return handleRouteError(res, error, '無法獲取邀請列表');
  }
});

// Get invitation details by token (new endpoint)
router.get('/:token', handleGetInvite);

module.exports = router;
