const express = require('express');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

// Generate secure random token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Send pairing invitation via email
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

    const { recipientEmail, message } = req.body;
    const senderId = req.user.id;
    const senderName = req.user.nickname;

    console.info(`📧 User ${senderId} (${senderName}) sending pairing invitation to ${recipientEmail}`);

    // Check if sender already has a couple relationship
    const existingCouple = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [senderId]
    );

    if (existingCouple.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: '您已經在一個情侶關係中，無法發送新的配對邀請',
        error_code: 'ALREADY_IN_COUPLE'
      });
    }

    // Check if recipient email is the same as sender
    if (recipientEmail.toLowerCase() === req.user.email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: '不能向自己發送配對邀請',
        error_code: 'CANNOT_INVITE_SELF'
      });
    }

    // Check if there's already a pending invitation to this email from this sender
    const existingInvitation = await db.query(
      'SELECT id FROM pairing_requests WHERE sender_id = $1 AND recipient_email = $2 AND status = $3',
      [senderId, recipientEmail, 'pending']
    );

    if (existingInvitation.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: '您已經向這個電子郵件地址發送過配對邀請，請等待對方回應',
        error_code: 'INVITATION_ALREADY_SENT'
      });
    }

    // Check if recipient already has an account and is in a couple
    const recipientUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [recipientEmail]
    );

    if (recipientUser.rows.length > 0) {
      const recipientCouple = await db.query(
        'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
        [recipientUser.rows[0].id]
      );

      if (recipientCouple.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: '這個用戶已經在一個情侶關係中',
          error_code: 'RECIPIENT_ALREADY_IN_COUPLE'
        });
      }
    }

    // Generate invitation token and expiration date (7 days)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store invitation in database
    const invitationResult = await db.query(`
      INSERT INTO pairing_requests (sender_id, recipient_email, token, message, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at
    `, [senderId, recipientEmail, token, message || null, expiresAt]);

    // Send email invitation
    try {
      if (emailService.isConfigured()) {
        await emailService.sendPairingInvitation(senderName, recipientEmail, token, message);
        console.log(`✅ Pairing invitation email sent to ${recipientEmail}`);
      } else {
        console.warn('⚠️ Email service not configured, invitation saved but email not sent');
      }
    } catch (emailError) {
      console.error('❌ Failed to send invitation email:', emailError);
      // Continue execution - invitation is saved even if email fails
    }

    res.status(201).json({
      success: true,
      message: '配對邀請已發送',
      invitation: {
        id: invitationResult.rows[0].id,
        recipientEmail,
        createdAt: invitationResult.rows[0].created_at,
        expiresAt,
        emailSent: emailService.isConfigured()
      }
    });

  } catch (error) {
    console.error('Send pairing invitation error:', error);
    res.status(500).json({
      success: false,
      message: '發送配對邀請失敗'
    });
  }
});

// Accept pairing invitation
router.post('/accept/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const isAuthenticated = req.user !== undefined;

    console.info(`🤝 Processing pairing acceptance for token ${token}, authenticated: ${isAuthenticated}`);

    // Find the invitation
    const invitationResult = await db.query(`
      SELECT pr.*, u.nickname as sender_nickname, u.email as sender_email
      FROM pairing_requests pr
      JOIN users u ON pr.sender_id = u.id
      WHERE pr.token = $1 AND pr.status = 'pending'
    `, [token]);

    if (invitationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '配對邀請不存在或已過期',
        error_code: 'INVITATION_NOT_FOUND'
      });
    }

    const invitation = invitationResult.rows[0];

    // Check if invitation has expired
    if (new Date() > new Date(invitation.expires_at)) {
      await db.query(
        'UPDATE pairing_requests SET status = $1 WHERE id = $2',
        ['expired', invitation.id]
      );

      return res.status(410).json({
        success: false,
        message: '配對邀請已過期',
        error_code: 'INVITATION_EXPIRED'
      });
    }

    // If user is not authenticated, return info for them to register/login
    if (!isAuthenticated) {
      return res.status(200).json({
        success: true,
        requiresAuth: true,
        invitation: {
          senderNickname: invitation.sender_nickname,
          recipientEmail: invitation.recipient_email,
          message: invitation.message,
          token: token
        },
        message: '請先登入或註冊以接受配對邀請'
      });
    }

    const accepterId = req.user.id;
    const accepterEmail = req.user.email;

    // Verify the recipient email matches the authenticated user
    if (accepterEmail.toLowerCase() !== invitation.recipient_email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: '只有受邀請的用戶才能接受此邀請',
        error_code: 'EMAIL_MISMATCH'
      });
    }

    // Check if accepter already has a couple relationship
    const accepterCouple = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [accepterId]
    );

    if (accepterCouple.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: '您已經在一個情侶關係中',
        error_code: 'ALREADY_IN_COUPLE'
      });
    }

    // Check if sender still doesn't have a couple (they might have paired with someone else)
    const senderCouple = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [invitation.sender_id]
    );

    if (senderCouple.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: '發送邀請的用戶已經與其他人建立了情侶關係',
        error_code: 'SENDER_ALREADY_PAIRED'
      });
    }

    // Create couple relationship using transaction
    const coupleId = require('uuid').v4();
    const now = new Date().toISOString();

    await db.transaction(async (client) => {
      // Create couple
      await client.query(`
        INSERT INTO couples (id, user1_id, user2_id, created_at)
        VALUES ($1, $2, $3, $4)
      `, [coupleId, invitation.sender_id, accepterId, now]);

      // Mark invitation as accepted
      await client.query(
        'UPDATE pairing_requests SET status = $1, responded_at = $2, responded_by = $3 WHERE id = $4',
        ['accepted', now, accepterId, invitation.id]
      );

      // Cancel any other pending invitations from both users
      await client.query(
        'UPDATE pairing_requests SET status = $1 WHERE (sender_id = $2 OR sender_id = $3) AND status = $4 AND id != $5',
        ['expired', invitation.sender_id, accepterId, 'pending', invitation.id]
      );
    });

    // Send notification email to original sender
    try {
      if (emailService.isConfigured()) {
        await emailService.sendPairingAccepted(invitation.sender_email, req.user.nickname);
        console.log(`✅ Pairing accepted notification sent to ${invitation.sender_email}`);
      }
    } catch (emailError) {
      console.error('❌ Failed to send pairing accepted notification:', emailError);
    }

    console.log(`✅ Couple relationship created: ${coupleId} (${invitation.sender_id} + ${accepterId})`);

    res.json({
      success: true,
      message: '配對成功！歡迎加入 Twogether',
      couple: {
        id: coupleId,
        partnerNickname: invitation.sender_nickname,
        createdAt: now
      }
    });

  } catch (error) {
    console.error('Accept pairing invitation error:', error);
    res.status(500).json({
      success: false,
      message: '接受配對邀請失敗'
    });
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
    res.status(500).json({
      success: false,
      message: '拒絕配對邀請失敗'
    });
  }
});

// Get invitation details by token (for display purposes)
router.get('/invitation/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await db.query(`
      SELECT pr.message, pr.recipient_email, pr.expires_at, pr.status, pr.created_at,
             u.nickname as sender_nickname
      FROM pairing_requests pr
      JOIN users u ON pr.sender_id = u.id
      WHERE pr.token = $1
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '配對邀請不存在',
        error_code: 'INVITATION_NOT_FOUND'
      });
    }

    const invitation = result.rows[0];

    // Check if expired
    const isExpired = new Date() > new Date(invitation.expires_at) || invitation.status !== 'pending';

    res.json({
      success: true,
      invitation: {
        senderNickname: invitation.sender_nickname,
        recipientEmail: invitation.recipient_email,
        message: invitation.message,
        createdAt: invitation.created_at,
        expiresAt: invitation.expires_at,
        status: invitation.status,
        isExpired
      }
    });

  } catch (error) {
    console.error('Get invitation details error:', error);
    res.status(500).json({
      success: false,
      message: '無法獲取邀請詳情'
    });
  }
});

// Get user's sent invitations (authenticated endpoint)
router.get('/my-invitations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(`
      SELECT id, recipient_email, message, status, created_at, expires_at
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
    res.status(500).json({
      success: false,
      message: '無法獲取邀請列表'
    });
  }
});

module.exports = router;