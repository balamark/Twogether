const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 10;
const EMAIL_INVITE_TTL_DAYS = 7;
const CODE_INVITE_TTL_DAYS = 7;

const JOURNEY_FIELDS = [
  'anniversary_date',
  'first_meet_date',
  'first_kiss_date',
  'first_kiss_place',
  'first_intimacy_date',
  'first_intimacy_place'
];

const createError = (status, error_code, message) => {
  const error = new Error(message);
  error.status = status;
  error.error_code = error_code;
  return error;
};

const normalizeEmail = (email) => (email || '').trim().toLowerCase();

const generateToken = () => crypto.randomBytes(32).toString('hex');

const generateShortCode = async (client) => {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    }

    const existing = await client.query(
      'SELECT 1 FROM pairing_requests WHERE short_code = $1',
      [code]
    );

    if (existing.rows.length === 0) {
      return code;
    }
  }

  throw createError(500, 'CODE_GENERATION_FAILED', '生成配對碼失敗，請稍後再試');
};

const hasCompleteCouple = async (client, userId) => {
  const result = await client.query(
    'SELECT id FROM couples WHERE (user1_id = $1 OR user2_id = $1) AND user2_id IS NOT NULL',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
};

const getDraftCouples = async (client, userId) => {
  const result = await client.query(
    `SELECT id, created_at, ${JOURNEY_FIELDS.join(', ')}
     FROM couples
     WHERE user1_id = $1 AND user2_id IS NULL
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
};

const collectDraftValue = (drafts, field) => {
  for (const draft of drafts) {
    if (draft[field]) {
      return draft[field];
    }
  }
  return null;
};

const mergeJourneyData = (inviterDrafts, accepterDrafts) => {
  const merged = {};
  const conflicts = {};

  JOURNEY_FIELDS.forEach((field) => {
    const inviterValue = collectDraftValue(inviterDrafts, field);
    const accepterValue = collectDraftValue(accepterDrafts, field);

    if (inviterValue) {
      merged[field] = inviterValue;
      if (accepterValue && accepterValue !== inviterValue) {
        conflicts[field] = {
          inviter: inviterValue,
          accepter: accepterValue
        };
      }
      return;
    }

    if (accepterValue) {
      merged[field] = accepterValue;
    }
  });

  return {
    merged,
    conflicts
  };
};

const createPairingInvite = async ({
  senderId,
  senderEmail,
  recipientEmail,
  message,
  type = 'email'
}) => {
  const inviteType = type || 'email';
  if (!['email', 'code'].includes(inviteType)) {
    throw createError(400, 'INVALID_INVITE_TYPE', '無效的邀請類型');
  }

  const completeCoupleId = await hasCompleteCouple(db, senderId);
  if (completeCoupleId) {
    throw createError(409, 'ALREADY_IN_COUPLE', '您已經在一個情侶關係中，無法發送新的配對邀請');
  }

  let normalizedRecipient = null;
  let recipientUserId = null;

  if (inviteType === 'email') {
    if (!recipientEmail) {
      throw createError(400, 'RECIPIENT_REQUIRED', '請提供對方的電子郵件地址');
    }

    normalizedRecipient = normalizeEmail(recipientEmail);
    const normalizedSender = normalizeEmail(senderEmail);

    if (normalizedRecipient === normalizedSender) {
      throw createError(400, 'CANNOT_INVITE_SELF', '不能向自己發送配對邀請');
    }

    const existingInvitation = await db.query(
      'SELECT id FROM pairing_requests WHERE sender_id = $1 AND recipient_email = $2 AND status = $3',
      [senderId, normalizedRecipient, 'pending']
    );

    if (existingInvitation.rows.length > 0) {
      throw createError(409, 'INVITATION_ALREADY_SENT', '您已經向這個電子郵件地址發送過配對邀請，請等待對方回應');
    }

    const recipientUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedRecipient]
    );

    if (recipientUser.rows.length > 0) {
      recipientUserId = recipientUser.rows[0].id;
      const recipientCouple = await hasCompleteCouple(db, recipientUserId);
      if (recipientCouple) {
        throw createError(409, 'RECIPIENT_ALREADY_IN_COUPLE', '這個用戶已經在一個情侶關係中');
      }
    }
  }

  if (inviteType === 'code') {
    await db.query(
      'UPDATE pairing_requests SET status = $1 WHERE sender_id = $2 AND type = $3 AND status = $4',
      ['expired', senderId, 'code', 'pending']
    );
  }

  const token = generateToken();
  const now = Date.now();
  const expiresAt = new Date(now + (inviteType === 'email' ? EMAIL_INVITE_TTL_DAYS : CODE_INVITE_TTL_DAYS) * 24 * 60 * 60 * 1000);

  const shortCode = inviteType === 'code'
    ? await generateShortCode(db)
    : null;

  const invitationResult = await db.query(`
    INSERT INTO pairing_requests (
      sender_id,
      recipient_email,
      token,
      message,
      expires_at,
      type,
      short_code,
      recipient_user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, created_at
  `, [
    senderId,
    normalizedRecipient,
    token,
    message || null,
    expiresAt,
    inviteType,
    shortCode,
    recipientUserId
  ]);

  return {
    id: invitationResult.rows[0].id,
    token,
    shortCode,
    expiresAt,
    createdAt: invitationResult.rows[0].created_at,
    recipientEmail: normalizedRecipient,
    recipientUserId
  };
};

const getPairingInvite = async (token) => {
  const result = await db.query(`
    SELECT pr.message, pr.recipient_email, pr.expires_at, pr.status, pr.created_at, pr.type, pr.short_code,
           u.nickname as sender_nickname
    FROM pairing_requests pr
    JOIN users u ON pr.sender_id = u.id
    WHERE pr.token = $1
  `, [token]);

  if (result.rows.length === 0) {
    throw createError(404, 'INVITATION_NOT_FOUND', '配對邀請不存在');
  }

  const invitation = result.rows[0];
  const isExpired = new Date() > new Date(invitation.expires_at) || invitation.status !== 'pending';

  return {
    senderNickname: invitation.sender_nickname,
    recipientEmail: invitation.recipient_email,
    message: invitation.message,
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
    status: invitation.status,
    isExpired,
    type: invitation.type,
    shortCode: invitation.short_code
  };
};

const acceptPairingInviteByToken = async ({ token, accepter }) => {
  const invitationResult = await db.query(`
    SELECT pr.*, u.nickname as sender_nickname, u.email as sender_email
    FROM pairing_requests pr
    JOIN users u ON pr.sender_id = u.id
    WHERE pr.token = $1 AND pr.status = 'pending'
  `, [token]);

  if (invitationResult.rows.length === 0) {
    throw createError(404, 'INVITATION_NOT_FOUND', '配對邀請不存在或已過期');
  }

  const invitation = invitationResult.rows[0];

  if (new Date() > new Date(invitation.expires_at)) {
    await db.query(
      'UPDATE pairing_requests SET status = $1 WHERE id = $2',
      ['expired', invitation.id]
    );
    throw createError(410, 'INVITATION_EXPIRED', '配對邀請已過期');
  }

  if (!accepter) {
    return {
      requiresAuth: true,
      invitation: {
        senderNickname: invitation.sender_nickname,
        recipientEmail: invitation.recipient_email,
        message: invitation.message,
        token
      }
    };
  }

  const accepterId = accepter.id;
  const accepterEmail = normalizeEmail(accepter.email);

  if (invitation.recipient_email && accepterEmail !== normalizeEmail(invitation.recipient_email)) {
    throw createError(403, 'EMAIL_MISMATCH', '只有受邀請的用戶才能接受此邀請');
  }

  if (invitation.sender_id === accepterId) {
    throw createError(400, 'SELF_PAIRING', '無法與自己配對');
  }

  const accepterCouple = await hasCompleteCouple(db, accepterId);
  if (accepterCouple) {
    throw createError(409, 'ALREADY_IN_COUPLE', '您已經在一個情侶關係中');
  }

  const senderCouple = await hasCompleteCouple(db, invitation.sender_id);
  if (senderCouple) {
    throw createError(409, 'SENDER_ALREADY_PAIRED', '發送邀請的用戶已經與其他人建立了情侶關係');
  }

  const coupleId = uuidv4();
  const nowIso = new Date().toISOString();

  const result = await db.transaction(async (client) => {
    const inviterDrafts = await getDraftCouples(client, invitation.sender_id);
    const accepterDrafts = await getDraftCouples(client, accepterId);

    const { merged, conflicts } = mergeJourneyData(inviterDrafts, accepterDrafts);
    const pendingConflicts = Object.keys(conflicts).length > 0 ? conflicts : null;

    const draftIds = [...inviterDrafts, ...accepterDrafts].map((draft) => draft.id);

    const fields = ['id', 'user1_id', 'user2_id', 'created_at'];
    const values = [coupleId, invitation.sender_id, accepterId, nowIso];

    JOURNEY_FIELDS.forEach((field) => {
      if (merged[field]) {
        fields.push(field);
        values.push(merged[field]);
      }
    });

    if (pendingConflicts) {
      fields.push('pending_conflicts');
      values.push(JSON.stringify(pendingConflicts));
    }

    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');

    await client.query(
      `INSERT INTO couples (${fields.join(', ')}) VALUES (${placeholders})`,
      values
    );

    await client.query(
      'UPDATE pairing_requests SET status = $1, responded_at = $2, responded_by = $3, recipient_user_id = $4 WHERE id = $5',
      ['accepted', nowIso, accepterId, accepterId, invitation.id]
    );

    const senderEmail = normalizeEmail(invitation.sender_email);

    const pendingResult = await client.query(
      `SELECT id FROM pairing_requests
       WHERE status = 'pending'
         AND id != $1
         AND (
           sender_id = $2 OR sender_id = $3 OR
           recipient_email = $4 OR recipient_email = $5
         )`,
      [invitation.id, invitation.sender_id, accepterId, senderEmail, accepterEmail]
    );

    if (pendingResult.rows.length > 0) {
      await client.query(
        `UPDATE pairing_requests
         SET status = $1
         WHERE status = 'pending'
           AND id != $2
           AND (
             sender_id = $3 OR sender_id = $4 OR
             recipient_email = $5 OR recipient_email = $6
           )`,
        ['expired', invitation.id, invitation.sender_id, accepterId, senderEmail, accepterEmail]
      );
    }

    if (draftIds.length > 0) {
      await client.query(
        `UPDATE love_moments
         SET couple_id = $1
         WHERE couple_id = ANY($2)`,
        [coupleId, draftIds]
      );

      await client.query(
        `UPDATE custom_scripts
         SET couple_id = $1
         WHERE couple_id = ANY($2)`,
        [coupleId, draftIds]
      );

      await client.query(
        `UPDATE custom_gifts
         SET couple_id = $1
         WHERE couple_id = ANY($2)`,
        [coupleId, draftIds]
      );

    }

    await client.query(
      `UPDATE love_moments
       SET couple_id = $1
       WHERE couple_id IS NULL AND recorded_by = ANY($2)`,
      [coupleId, [invitation.sender_id, accepterId]]
    );

    await client.query(
      `UPDATE custom_scripts
       SET couple_id = $1
       WHERE couple_id IS NULL AND created_by = ANY($2)`,
      [coupleId, [invitation.sender_id, accepterId]]
    );

    await client.query(
      `UPDATE custom_gifts
       SET couple_id = $1
       WHERE couple_id IS NULL AND created_by = ANY($2)`,
      [coupleId, [invitation.sender_id, accepterId]]
    );

    if (draftIds.length > 0) {
      await client.query(
        'DELETE FROM couples WHERE id = ANY($1)',
        [draftIds]
      );
    }

    return {
      autoResolved: pendingResult.rows.length > 0,
      pendingConflicts
    };
  });

  return {
    success: true,
    coupleId,
    partnerNickname: invitation.sender_nickname,
    createdAt: nowIso,
    autoResolved: result.autoResolved,
    pendingConflicts: result.pendingConflicts,
    senderEmail: invitation.sender_email
  };
};

const acceptPairingInviteByCode = async ({ code, accepter }) => {
  const shortCode = (code || '').trim().toUpperCase();
  if (!shortCode) {
    throw createError(400, 'INVALID_CODE', '請輸入有效的配對碼');
  }

  const inviteResult = await db.query(
    'SELECT token FROM pairing_requests WHERE short_code = $1 AND status = $2',
    [shortCode, 'pending']
  );

  if (inviteResult.rows.length === 0) {
    throw createError(404, 'INVITATION_NOT_FOUND', '無效或過期的配對碼');
  }

  return acceptPairingInviteByToken({ token: inviteResult.rows[0].token, accepter });
};

module.exports = {
  createError,
  createPairingInvite,
  getPairingInvite,
  acceptPairingInviteByToken,
  acceptPairingInviteByCode
};
