const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');
const characterMappingService = require('../services/characterMappingService');
const llmService = require('../services/llmService');
const { getCoupleIdForUser, getCoupleTier, getLimit, checkLimit } = require('../lib/entitlements');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();

// All intimacy request routes require authentication
router.use(authenticateToken);

const NUDGE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// AI usage gating — the roleplay invitation generator hits the paid LLM, so it
// shares the tier-aware daily AI budget with the events icebreaker/reply-rewrite
// (same event_ai_usage table; see routes/events.js). Helpers are duplicated here
// the same way ensureNotificationsTable is, to keep the routers self-contained.
// ---------------------------------------------------------------------------

async function ensureEventAiUsageTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS event_ai_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind VARCHAR(32) NOT NULL,
        provider VARCHAR(32),
        model VARCHAR(64),
        duration_ms INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_create_tokens INTEGER,
        cache_read_tokens INTEGER,
        cost_usd NUMERIC(12, 8),
        raw_input TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_event_ai_usage_user_day
        ON event_ai_usage (user_id, kind, created_at DESC)
    `);
  } catch (err) {
    logWarn('ensureEventAiUsageTable failed', { err: err.message });
  }
}

// All paid AI calls share one daily budget — keep this kind list in sync with
// countTodayAiUsage in routes/events.js.
async function countTodayAiUsage(userId) {
  try {
    await ensureEventAiUsageTable();
    const result = await db.query(
      `SELECT COUNT(*)::int AS c
         FROM event_ai_usage
        WHERE user_id = $1
          AND kind IN ('icebreaker', 'reply_rewrite', 'roleplay_messages')
          AND created_at >= DATE_TRUNC('day', NOW())`,
      [userId]
    );
    return result.rows[0]?.c || 0;
  } catch (err) {
    // Fail open — serve the user rather than block on a count failure.
    logWarn('countTodayAiUsage failed', { err: err.message });
    return 0;
  }
}

async function resolveAiLimit(userId) {
  const coupleId = await getCoupleIdForUser(userId);
  const tier = await getCoupleTier(coupleId);
  return { tier, limit: getLimit(tier, 'icebreaker_per_day') };
}

async function recordAiUsage(userId, kind, rawInput, meta) {
  try {
    await ensureEventAiUsageTable();
    const usage = meta?.usage || {};
    await db.query(
      `INSERT INTO event_ai_usage (
         user_id, kind, provider, model, duration_ms,
         input_tokens, output_tokens, cache_create_tokens, cache_read_tokens,
         cost_usd, raw_input
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        userId,
        kind,
        meta?.provider || null,
        meta?.model || null,
        meta?.durationMs ?? null,
        usage.inputTokens ?? null,
        usage.outputTokens ?? null,
        usage.cacheCreateTokens ?? null,
        usage.cacheReadTokens ?? null,
        meta?.costUsd ?? null,
        rawInput,
      ]
    );
  } catch (err) {
    logWarn('recordAiUsage failed', { kind, err: err.message });
  }
}

const normalizeCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const determineNudge = (monthStats) => {
  const shouldNudgeRejected = monthStats.rejected >= NUDGE_THRESHOLD;
  const shouldNudgeUnanswered = monthStats.unanswered >= NUDGE_THRESHOLD;

  let reason = null;
  let message = null;

  if (shouldNudgeRejected && shouldNudgeUnanswered) {
    reason = 'rejected_and_unanswered';
    message = '最近有幾次親密邀請被婉拒或沒有回應。我很重視我們的連結，也想了解你的感受。也許我們可以找個時間聊聊，看看怎麼讓彼此都感到被愛與被理解？';
  } else if (shouldNudgeRejected) {
    reason = 'rejected';
    message = '最近有幾次親密邀請被你婉拒，我很想知道你的想法，因為我在乎你的舒適與感受。願意找個時刻聊聊，讓我們找到彼此都安心的步調嗎？';
  } else if (shouldNudgeUnanswered) {
    reason = 'unanswered';
    message = '最近有幾次親密邀請一直等不到你的回覆，我會擔心是不是哪裡讓你不舒服。你的想法對我很重要，我們可以聊聊，一起打造舒服的親密氛圍嗎？';
  }

  return {
    shouldNudge: Boolean(message),
    reason,
    message,
  };
};

const computeIntimacyStatsForReceiver = async (userId) => {
  const now = new Date();

  const weekCutoff = new Date(now);
  weekCutoff.setDate(weekCutoff.getDate() - 7);

  const monthCutoff = new Date(now);
  monthCutoff.setDate(monthCutoff.getDate() - 30);

  const statsResult = await db.query(`
    SELECT
      SUM(CASE WHEN status = 'accepted' AND responded_at >= $2 THEN 1 ELSE 0 END) AS week_accepted,
      SUM(CASE WHEN status = 'rejected' AND responded_at >= $2 THEN 1 ELSE 0 END) AS week_rejected,
      SUM(CASE WHEN status = 'pending' AND created_at >= $2 THEN 1 ELSE 0 END) AS week_unanswered,
      SUM(CASE WHEN status = 'accepted' AND responded_at >= $3 THEN 1 ELSE 0 END) AS month_accepted,
      SUM(CASE WHEN status = 'rejected' AND responded_at >= $3 THEN 1 ELSE 0 END) AS month_rejected,
      SUM(CASE WHEN status = 'pending' AND created_at >= $3 THEN 1 ELSE 0 END) AS month_unanswered
    FROM intimacy_requests
    WHERE receiver_id = $1
      AND (created_at >= $3 OR (responded_at IS NOT NULL AND responded_at >= $3))
  `, [userId, weekCutoff.toISOString(), monthCutoff.toISOString()]);

  const row = statsResult.rows[0] || {};

  const stats = {
    week: {
      accepted: normalizeCount(row.week_accepted),
      rejected: normalizeCount(row.week_rejected),
      unanswered: normalizeCount(row.week_unanswered),
    },
    month: {
      accepted: normalizeCount(row.month_accepted),
      rejected: normalizeCount(row.month_rejected),
      unanswered: normalizeCount(row.month_unanswered),
    }
  };

  const nudge = determineNudge(stats.month);

  return { stats, nudge };
};

// Create intimacy request
router.post('/', [
  body('message')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('訊息不能超過1000個字符'),
  body('request_type')
    .isIn(['general', 'romantic', 'playful', 'surprise', 'compliment', 'intimate', 'reconciliation'])
    .withMessage('請求類型無效'),
  body('scheduled_time')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('scheduled_time 必須為 ISO8601 字串'),
  body('roleplay_category')
    .optional({ nullable: true })
    .isLength({ max: 100 })
    .withMessage('roleplay_category 過長')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logWarn('Intimacy request validation failed', { userId: req.user?.id, errors: errors.array() });
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { message, request_type, scheduled_time, roleplay_category } = req.body;

    logInfo('Creating intimacy request', { userId, request_type, hasMessage: !!message, hasSchedule: !!scheduled_time });

    // Find user's couple and partner
    const coupleResult = await db.query(`
      SELECT 
        c.id as couple_id,
        CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END as partner_id
      FROM couples c
      WHERE (c.user1_id = $1 OR c.user2_id = $1) AND c.user2_id IS NOT NULL
    `, [userId]);

    if (coupleResult.rows.length === 0) {
      logWarn('Intimacy request without complete couple', { userId });
      return res.status(404).json({
        success: false,
        message: '您還沒有完整的情侶關係',
        error_code: 'NO_COMPLETE_COUPLE'
      });
    }

    const { couple_id: coupleId, partner_id: partnerId } = coupleResult.rows[0];

    // Create intimacy request
    const requestId = uuidv4();
    const now = new Date().toISOString();

    const result = await db.query(`
      INSERT INTO intimacy_requests (
        id, couple_id, sender_id, receiver_id, message_content, request_type,
        roleplay_category, scheduled_time, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
      RETURNING id, message_content, request_type, roleplay_category, scheduled_time, status, created_at
    `, [requestId, coupleId, userId, partnerId, message || null, request_type, roleplay_category || null, scheduled_time || null, now]);

    const request = result.rows[0];

    // Create notification for the recipient
    try {
      await db.query(`
        INSERT INTO notifications (
          user_id, notification_type, title, content,
          intimacy_request_id, related_user_id, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        partnerId,
        'intimacy_request',
        '親密邀請',
        request.message_content || '您收到了一個新的親密邀請',
        requestId,
        userId,
        2
      ]);
      logInfo('Created intimacy request notification', { requestId });
    } catch (notificationError) {
      logWarn('Failed to create intimacy request notification', { err: notificationError.message });
      // Don't fail the request if notification creation fails
    }

    // Send email notification to partner — honors the partner's "Email 通知"
    // switch (the in-app notification above is sent regardless).
    try {
      const partner = await emailService.getUserEmailIfOptedIn(db, partnerId);
      if (partner) {
        const senderNickname = req.user.nickname || '你的伴侶';
        logInfo('Sending intimacy request email', { kind: 'intimacy_request', partnerId });
        await emailService.sendIntimacyRequestNotification(
          senderNickname,
          partner.email,
          request_type,
          message || ''
        );
      } else {
        logInfo('Partner opted out of email or unreachable; skipping intimacy request email', { partnerId });
      }
    } catch (emailError) {
      logWarn('Failed to send intimacy request email', { kind: 'intimacy_request', err: emailError.message, code: emailError.code });
      // Don't fail the request if email sending fails
    }

    logInfo('Intimacy request created', { requestId, fromUserId: userId, toUserId: partnerId });

    res.status(201).json({
      success: true,
      message: '親密請求已發送',
      intimacy_request: {
        ...request,
        requester: {
          id: userId,
          nickname: req.user.nickname
        }
      }
    });

  } catch (error) {
    logError('Create intimacy request failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '發送親密請求失敗'
    });
  }
});

// Generate AI roleplay invitation messages for a chosen script.
// Returns a short setup summary + 5 escalating in-character opening messages so
// the sender can pick one (and edit it) before sending an intimacy invitation.
router.post('/script-messages', [
  body('scriptTitle')
    .isString().trim().isLength({ min: 1, max: 200 })
    .withMessage('劇本標題為必填'),
  body('scriptScenario').optional({ nullable: true }).isLength({ max: 500 }),
  body('scriptBody').optional({ nullable: true }).isLength({ max: 8000 }),
  body('category').optional({ nullable: true }).isLength({ max: 50 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logWarn('Roleplay messages validation failed', { userId: req.user?.id, errors: errors.array() });
    return res.status(400).json({ success: false, message: '劇本資料不完整，請重新選擇劇本', errors: errors.array() });
  }

  const userId = req.user.id;
  const { scriptTitle, scriptScenario, scriptBody, category } = req.body;

  try {
    // Tier-aware daily AI budget — shared with the events icebreaker.
    const { tier, limit } = await resolveAiLimit(userId);
    const usedToday = await countTodayAiUsage(userId);
    const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
    if (!limitCheck.ok) {
      logInfo('intimacy.script_messages.limit', { userId, used: usedToday, limit, tier, blocked: true });
      return res.status(limitCheck.status).json(limitCheck.body);
    }

    logInfo('intimacy.script_messages.input', { userId, scriptTitle, category, hasBody: !!scriptBody });

    const result = await llmService.generateRoleplayMessages({
      title: scriptTitle,
      scenario: scriptScenario,
      scriptBody,
      category,
    });
    const meta = result._meta;
    delete result._meta;

    const usableCount = (result.messages || []).filter((m) => m.text && m.text.trim()).length;
    if (usableCount === 0) {
      logWarn('intimacy.script_messages.empty', { userId, scriptTitle });
      return res.status(502).json({
        success: false,
        message: 'AI 暫時無法生成這個劇本的建議訊息，請稍後再試，或直接自行輸入邀請內容',
        error_code: 'ROLEPLAY_MESSAGES_EMPTY',
      });
    }

    logInfo('intimacy.script_messages.cost', {
      userId,
      provider: meta?.provider,
      model: meta?.model,
      costUsd: meta?.costUsd,
      durationMs: meta?.durationMs,
      usableCount,
      usedToday: usedToday + 1,
      limit,
      tier,
    });

    await recordAiUsage(userId, 'roleplay_messages', scriptTitle, meta);

    res.json({ success: true, summary: result.summary, messages: result.messages });
  } catch (error) {
    logError('Generate roleplay messages failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'AI 暫時無法生成建議訊息，請稍後再試，或直接自行輸入邀請內容',
      error_code: 'ROLEPLAY_MESSAGES_FAILED',
    });
  }
});

// Get intimacy request statistics for the authenticated user (as receiver)
router.get('/stats', async (req, res) => {
  try {
    const { stats, nudge } = await computeIntimacyStatsForReceiver(req.user.id);

    res.json({
      success: true,
      statistics: stats,
      nudge
    });
  } catch (error) {
    logError('Get intimacy request stats failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '無法獲取邀請統計'
    });
  }
});

router.post('/stats/send-nudge', async (req, res) => {
  try {
    const userId = req.user.id;
    const { stats, nudge } = await computeIntimacyStatsForReceiver(userId);

    if (!nudge.shouldNudge || !nudge.message) {
      return res.json({
        success: false,
        message: '目前的回應狀況穩定，不需要特別提醒。'
      });
    }

    const coupleResult = await db.query(`
      SELECT 
        c.id as couple_id,
        CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END as partner_id
      FROM couples c
      WHERE (c.user1_id = $1 OR c.user2_id = $1) AND c.user2_id IS NOT NULL
    `, [userId]);

    if (coupleResult.rows.length === 0) {
      return res.json({
        success: false,
        message: '尚未找到完整的情侶關係，請先完成配對。'
      });
    }

    const { partner_id: partnerId } = coupleResult.rows[0];

    const partnerResult = await db.query('SELECT email, nickname, email_notifications_enabled FROM users WHERE id = $1', [partnerId]);
    const partnerData = partnerResult.rows[0];

    if (!partnerData?.email) {
      return res.json({
        success: false,
        message: '找不到伴侶的電子郵件地址，請請伴侶更新資訊。'
      });
    }

    // Respect the partner's "Email 通知" switch — this is an email-only nudge,
    // so if they've opted out there's nothing to send.
    if (partnerData.email_notifications_enabled === false) {
      return res.json({
        success: false,
        message: '你的伴侶已關閉 Email 通知，目前無法寄出提醒。'
      });
    }

    if (!emailService.isConfigured()) {
      logWarn('Email service not configured; cannot send intimacy nudge', { kind: 'intimacy_nudge' });
      return res.json({
        success: false,
        message: '信件服務尚未設定，因此暫時無法寄出提醒。'
      });
    }

    const senderNickname = req.user.nickname || '你的伴侶';
    const partnerNickname = partnerData.nickname || '親愛的';
    const partnerEmail = partnerData.email;

    await emailService.sendIntimacyInvitationInsightsEmail({
      senderNickname,
      partnerNickname,
      partnerEmail,
      stats,
      nudgeMessage: nudge.message,
      nudgeReason: nudge.reason || null,
    });

    res.json({
      success: true,
      message: '已寄出貼心提醒信，祝你們的對話順利💌'
    });
  } catch (error) {
    logError('Send intimacy nudge email failed', { kind: 'intimacy_nudge', err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '寄送提醒信時發生錯誤，請稍後再試。'
    });
  }
});

// Get intimacy requests (sent and received)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'all', status = 'all', page = 1, limit = 20 } = req.query;
    
    logInfo('Fetching intimacy requests', { userId, type, status, page });
    
    const offset = (page - 1) * limit;

    // Build where conditions
    let whereConditions = ['(ir.sender_id = $1 OR ir.receiver_id = $1)'];
    let params = [userId];
    let paramIndex = 2;

    if (type === 'sent') {
      whereConditions.push(`ir.sender_id = $1`);
      whereConditions = [`ir.sender_id = $1`]; // Override previous condition
    } else if (type === 'received') {
      whereConditions.push(`ir.receiver_id = $1`);
      whereConditions = [`ir.receiver_id = $1`]; // Override previous condition
    }

    if (status !== 'all') {
      whereConditions.push(`ir.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM intimacy_requests ir WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get requests with user info
    params.push(parseInt(limit), offset);
    
    const result = await db.query(`
      SELECT
        ir.id, ir.message_content, ir.request_type, ir.roleplay_category,
        ir.scheduled_time, ir.status, ir.created_at, ir.responded_at, ir.expires_at,
        ir.response_message, ir.alternative_type, ir.alternative_content,
        ir.alternative_scheduled_time,
        sender.id as sender_id, sender.nickname as sender_nickname,
        receiver.id as receiver_id, receiver.nickname as receiver_nickname,
        CASE WHEN ir.sender_id = $1 THEN 'sent' ELSE 'received' END as direction
      FROM intimacy_requests ir
      JOIN users sender ON ir.sender_id = sender.id
      JOIN users receiver ON ir.receiver_id = receiver.id
      WHERE ${whereClause}
      ORDER BY ir.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, params);

    const requests = result.rows.map(row => ({
      id: row.id,
      message_content: row.message_content,
      request_type: row.request_type,
      roleplay_category: row.roleplay_category,
      scheduled_time: row.scheduled_time,
      status: row.status,
      direction: row.direction,
      created_at: row.created_at,
      responded_at: row.responded_at,
      expires_at: row.expires_at,
      response_message: row.response_message,
      alternative_type: row.alternative_type,
      alternative_content: row.alternative_content,
      alternative_scheduled_time: row.alternative_scheduled_time,
      sender_nickname: row.sender_nickname,
      receiver_nickname: row.receiver_nickname,
      requester: {
        id: row.sender_id,
        nickname: row.sender_nickname
      },
      recipient: {
        id: row.receiver_id,
        nickname: row.receiver_nickname
      }
    }));

    res.json({
      success: true,
      intimacy_requests: requests,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (error) {
    logError('Get intimacy requests failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取親密請求失敗'
    });
  }
});

// Respond to intimacy request
router.put('/:id/respond', [
  body('response')
    .isIn(['accepted', 'declined', 'rejected'])
    .withMessage('回應必須是 accepted、declined 或 rejected'),
  body('response_message')
    .optional({ nullable: true })
    .isLength({ max: 500 })
    .withMessage('回應訊息不能超過500個字符'),
  body('alternative_type')
    .optional({ nullable: true })
    .isLength({ max: 50 }),
  body('alternative_content')
    .optional({ nullable: true })
    .isLength({ max: 500 }),
  body('alternative_scheduled_time')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('alternative_scheduled_time 必須為 ISO8601 字串')
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
    const requestId = req.params.id;
    const {
      response,
      response_message,
      alternative_type,
      alternative_content,
      alternative_scheduled_time,
    } = req.body;

    // Check if user is the recipient of this request
    const requestResult = await db.query(
      'SELECT id, status, sender_id FROM intimacy_requests WHERE id = $1 AND receiver_id = $2',
      [requestId, userId]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '這個邀請已被撤回或無法回應，請重新整理頁面'
      });
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: '此請求已經被回應過了'
      });
    }

    // Normalize: schema canonical is 'rejected' (per migration 009); 'declined' came
    // in from older clients. Keep the API tolerant but store the canonical value so
    // the stats query (which counts 'rejected') stays in sync.
    const normalizedStatus = response === 'accepted' ? 'accepted' : 'rejected';

    // Update request status
    const now = new Date().toISOString();
    await db.query(
      `UPDATE intimacy_requests
       SET status = $1,
           response_message = $2,
           responded_at = $3,
           alternative_type = $4,
           alternative_content = $5,
           alternative_scheduled_time = $6
       WHERE id = $7`,
      [
        normalizedStatus,
        response_message || null,
        now,
        alternative_type || null,
        alternative_content || null,
        alternative_scheduled_time || null,
        requestId,
      ]
    );

    // If accepted, award coins to the couple's shared balance. Wrapped in
    // try/catch so an unexpected failure here doesn't roll back the user's
    // accept — the response itself is already persisted above. The earlier
    // version of this block wrote to `users.coins` (no such column in prod)
    // and inserted `user_id` + `transaction_type='bonus'` rows that violate
    // the coin_transactions schema (couple_id, transaction_type IN
    // ('earn','spend')). Both were silently failing for every accept.
    if (response === 'accepted') {
      const coinAmount = 10;
      try {
        const coupleResult = await db.query(
          `SELECT id FROM couples
           WHERE (user1_id = $1 AND user2_id = $2)
              OR (user1_id = $2 AND user2_id = $1)`,
          [request.sender_id, userId]
        );
        if (coupleResult.rows.length > 0) {
          await db.query(`
            INSERT INTO coin_transactions (id, couple_id, amount, transaction_type, earned_from, description, transaction_date)
            VALUES ($1, $2, $3, 'earn', 'intimacy_accept', '親密邀請被接受獎勵', $4)
          `, [uuidv4(), coupleResult.rows[0].id, coinAmount, now]);
        } else {
          logWarn('Skipped intimacy accept coins — couple not found', { requestId });
        }
      } catch (coinError) {
        logWarn('Failed to award intimacy accept coins', { err: coinError.message, code: coinError.code, requestId });
      }
    }

    // Create notification for the original requester about the response
    try {
      const notificationTitle = response === 'accepted' ? '邀請被接受 💕' : '邀請被婉拒';
      const notificationContent = response === 'accepted' 
        ? '你的親密邀請被接受了！' 
        : (response_message || '你的親密邀請被婉拒了');

      await db.query(`
        INSERT INTO notifications (
          user_id, notification_type, title, content, 
          intimacy_request_id, related_user_id, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        request.sender_id,
        'request_response',
        notificationTitle,
        notificationContent,
        requestId,
        userId,
        2
      ]);
      logInfo('Created intimacy response notification', { requestId });
    } catch (notificationError) {
      logWarn('Failed to create intimacy response notification', { err: notificationError.message });
      // Don't fail the request if notification creation fails
    }

    // Fire-and-forget email to the original sender. Honors per-user opt-out.
    try {
      const sender = await emailService.getUserEmailIfOptedIn(db, request.sender_id);
      if (sender) {
        const receiverRow = await db.query(`SELECT nickname FROM users WHERE id = $1`, [userId]);
        await emailService.sendIntimacyResponseNotification({
          receiverName: receiverRow.rows[0]?.nickname || null,
          senderEmail: sender.email,
          response,
          responseMessage: response_message || '',
        });
      }
    } catch (emailError) {
      logWarn('Failed to send intimacy response email', { kind: 'intimacy_response', err: emailError.message, code: emailError.code });
    }

    logInfo('Intimacy request responded', { requestId, response, userId });

    // Fetch the updated request with sender and receiver information
    const updatedRequestResult = await db.query(`
      SELECT 
        ir.id, ir.message_content, ir.request_type, ir.status, ir.created_at, ir.responded_at,
        ir.response_message, ir.alternative_type, ir.alternative_content, ir.alternative_scheduled_time,
        sender.id as sender_id, sender.nickname as sender_nickname,
        receiver.id as receiver_id, receiver.nickname as receiver_nickname,
        CASE WHEN ir.sender_id = $2 THEN 'sent' ELSE 'received' END as direction
      FROM intimacy_requests ir
      JOIN users sender ON ir.sender_id = sender.id
      JOIN users receiver ON ir.receiver_id = receiver.id
      WHERE ir.id = $1
    `, [requestId, userId]);

    if (updatedRequestResult.rows.length === 0) {
      logError('Failed to fetch updated request after respond', { requestId });
      return res.status(500).json({
        success: false,
        message: '回應成功但無法獲取更新後的請求信息'
      });
    }

    const updatedRequest = updatedRequestResult.rows[0];

    res.json({
      success: true,
      message: response === 'accepted' ? '請求已接受' : '請求已拒絕',
      id: updatedRequest.id,
      message_content: updatedRequest.message_content,
      request_type: updatedRequest.request_type,
      status: updatedRequest.status,
      created_at: updatedRequest.created_at,
      responded_at: updatedRequest.responded_at,
      response_message: updatedRequest.response_message,
      alternative_type: updatedRequest.alternative_type,
      alternative_content: updatedRequest.alternative_content,
      alternative_scheduled_time: updatedRequest.alternative_scheduled_time,
      sender_nickname: updatedRequest.sender_nickname,
      receiver_nickname: updatedRequest.receiver_nickname,
      direction: updatedRequest.direction
    });

  } catch (error) {
    logError('Respond to intimacy request failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '回應親密請求失敗'
    });
  }
});

// Delete intimacy request (only requester can delete)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = req.params.id;

    // Delete request (only if user is the requester)
    const result = await db.query(
      'DELETE FROM intimacy_requests WHERE id = $1 AND sender_id = $2 RETURNING id',
      [requestId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的請求或您沒有權限刪除'
      });
    }

    logInfo('Intimacy request deleted', { requestId });

    res.json({
      success: true,
      message: '親密請求已刪除'
    });

  } catch (error) {
    logError('Delete intimacy request failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '刪除親密請求失敗'
    });
  }
});

// Get unread notification count
router.get('/notifications/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;
    logInfo('Getting unread notification count', { userId });

    // Count unread notifications for the user
    const result = await db.query(`
      SELECT COUNT(*) as unread_count
      FROM notifications 
      WHERE user_id = $1 AND is_read = false
    `, [userId]).catch(async (error) => {
      if (error.message.includes('relation "notifications" does not exist')) {
        // Fallback to counting pending intimacy requests if notifications table doesn't exist
        logInfo('Notifications table missing; falling back to intimacy_requests');
        return await db.query(`
          SELECT COUNT(*) as unread_count
          FROM intimacy_requests 
          WHERE receiver_id = $1 AND status = 'pending'
        `, [userId]);
      }
      throw error;
    });

    const unreadCount = parseInt(result.rows[0].unread_count) || 0;
    logInfo('Unread notification count fetched', { userId, unreadCount });

    res.json({
      success: true,
      unread_count: unreadCount
    });

  } catch (error) {
    logError('Get unread notification count failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取未讀通知數量失敗',
      unread_count: 0
    });
  }
});

// Get intimacy templates
router.get('/intimacy-templates', async (req, res) => {
  try {
    const userId = req.user.id;
    logInfo('Getting intimacy templates', { userId });

    // Get intimacy templates from existing Supabase table
    const result = await db.query(`
      SELECT id, category, time_hint, roleplay_setup, suggestion_level, created_at
      FROM intimacy_templates
      WHERE is_active = true
      ORDER BY category, created_at
    `);

    const templates = result.rows.map(row => ({
      id: row.id,
      category: row.category,
      time_hint: row.time_hint,
      roleplay_setup: row.roleplay_setup,
      suggestion_level: row.suggestion_level,
      created_at: row.created_at
    }));

    logInfo('Intimacy templates retrieved', { count: templates.length });

    res.json({
      success: true,
      templates
    });

  } catch (error) {
    logError('Get intimacy templates failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取親密模板失敗',
      templates: []
    });
  }
});

// Get intimacy templates by category
router.get('/intimacy-templates/:category', async (req, res) => {
  try {
    const userId = req.user.id;
    const { category } = req.params;

    logInfo('Getting intimacy templates by category', { userId, category });

    // Get user's gender and couple information for character mapping
    const userResult = await db.query(`
      SELECT
        u.gender,
        u.nickname,
        c.user1_id,
        c.user2_id,
        u1.nickname as user1_nickname,
        u2.nickname as user2_nickname
      FROM users u
      LEFT JOIN couples c ON (c.user1_id = u.id OR c.user2_id = u.id)
      LEFT JOIN users u1 ON c.user1_id = u1.id
      LEFT JOIN users u2 ON c.user2_id = u2.id
      WHERE u.id = $1
    `, [userId]);

    const userGender = userResult.rows[0]?.gender || null;
    const userNickname = userResult.rows[0]?.nickname || 'You';

    // Determine partner nickname based on couple relationship
    let partnerNickname = 'Partner';
    if (userResult.rows[0]?.user1_nickname && userResult.rows[0]?.user2_nickname) {
      const isUser1 = userResult.rows[0]?.user1_id === userId;
      partnerNickname = isUser1 ? userResult.rows[0].user2_nickname : userResult.rows[0].user1_nickname;
    }

    logInfo('User profile for template processing', { userId, gender: userGender || null, nickname: userNickname, partnerNickname });

    const result = await db.query(`
      SELECT id, category, time_hint, roleplay_setup, suggestion_level, created_at
      FROM intimacy_templates
      WHERE category = $1 AND is_active = true
      ORDER BY created_at
    `, [category]);

    const templates = result.rows.map(row => ({
      id: row.id,
      category: row.category,
      time_hint: row.time_hint,
      roleplay_setup: characterMappingService.processTemplate(
        row.roleplay_setup,
        category,
        userGender,
        userNickname,
        partnerNickname
      ),
      suggestion_level: row.suggestion_level,
      created_at: row.created_at
    }));

    logInfo('Templates retrieved with gender-aware processing', { count: templates.length, category });

    res.json({
      success: true,
      templates
    });

  } catch (error) {
    logError('Get intimacy templates by category failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取分類親密模板失敗',
      templates: []
    });
  }
});

// Get alternative intimacy options
router.get('/alternative-intimacy-options', async (req, res) => {
  try {
    const userId = req.user.id;
    logInfo('Getting alternative intimacy options', { userId });

    // Check if alternative_intimacy_options table exists, if not create it
    const result = await db.query(`
      SELECT id, category, title, description, estimated_duration, sort_order
      FROM alternative_intimacy_options 
      ORDER BY category, sort_order, title
    `).catch(async (error) => {
      if (error.message.includes('relation "alternative_intimacy_options" does not exist')) {
        logInfo('Creating alternative_intimacy_options table');
        
        // Create the table
        await db.query(`
          CREATE TABLE IF NOT EXISTS alternative_intimacy_options (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            category VARCHAR(50) NOT NULL,
            title VARCHAR(100) NOT NULL,
            description TEXT NOT NULL,
            estimated_duration VARCHAR(50),
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
          );
          
          CREATE INDEX IF NOT EXISTS idx_alternative_options_category ON alternative_intimacy_options(category);
        `);

        // Insert default alternative options
        await db.query(`
          INSERT INTO alternative_intimacy_options (category, title, description, estimated_duration, is_default, sort_order) VALUES
          ('physical', '5分鐘擁抱', '緊緊擁抱對方，感受彼此的溫暖', '5分鐘', true, 1),
          ('physical', '牽手散步', '手牽手到陽台或附近走走', '10分鐘', true, 2),
          ('physical', '頭靠肩膀', '依偎在一起，頭靠在對方肩膀上', '5分鐘', true, 3),
          ('physical', '互相按摩', '輕柔地為對方按摩肩膀或手臂', '15分鐘', true, 4),
          ('emotional', '分享今天心情', '聊聊今天發生的事和感受', '10分鐘', true, 1),
          ('emotional', '說一句感謝', '表達對伴侶的感謝和讚美', '3分鐘', true, 2),
          ('emotional', '分享小回憶', '回憶一件美好的共同經歷', '5分鐘', true, 3),
          ('emotional', '互相讚美', '說說對方今天最棒的地方', '5分鐘', true, 4),
          ('playful', '搞怪自拍挑戰', '一起拍3分鐘的有趣照片', '3分鐘', true, 1),
          ('playful', '看短影片', '一起看一小段有趣的影片', '10分鐘', true, 2),
          ('playful', '小遊戲時光', '玩一局簡單的手機遊戲', '15分鐘', true, 3),
          ('playful', '唱歌給對方聽', '為對方哼唱一首喜歡的歌', '5分鐘', true, 4),
          ('companionship', '一起泡茶', '準備一壺茶，安靜地享受', '15分鐘', true, 1),
          ('companionship', '準備小點心', '為對方準備喜歡的小零食', '10分鐘', true, 2),
          ('companionship', '看夜景', '一起到窗邊或陽台看風景', '10分鐘', true, 3),
          ('companionship', '規劃小旅行', '討論下次想一起去的地方', '20分鐘', true, 4)
        `);

        logInfo('Created alternative_intimacy_options table with default data');
        
        // Now fetch the data
        return await db.query(`
          SELECT id, category, title, description, estimated_duration, sort_order
          FROM alternative_intimacy_options 
          ORDER BY category, sort_order, title
        `);
      }
      throw error;
    });

    // Group options by category
    const grouped = {
      physical: [],
      emotional: [],
      playful: [],
      companionship: []
    };

    result.rows.forEach(row => {
      const option = {
        id: row.id,
        category: row.category,
        title: row.title,
        description: row.description,
        estimated_duration: row.estimated_duration
      };

      if (grouped[row.category]) {
        grouped[row.category].push(option);
      }
    });

    const totalOptions = result.rows.length;
    logInfo('Alternative intimacy options retrieved', { totalOptions });

    res.json({
      success: true,
      ...grouped
    });

  } catch (error) {
    logError('Get alternative intimacy options failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取替代親密選項失敗',
      physical: [],
      emotional: [],
      playful: [],
      companionship: []
    });
  }
});

// Ensure-on-first-call: the `event_id` column was added later for the events
// × 破冰 deep-link. Older deployments may not have it yet, and the events
// route only adds it when an event is actually created. Run an idempotent
// ALTER once per process so the SELECT below doesn't 500.
let notificationsEventIdEnsured = false;
async function ensureNotificationsEventIdColumn() {
  if (notificationsEventIdEnsured) return;
  try {
    await db.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_id UUID`);
    notificationsEventIdEnsured = true;
  } catch (err) {
    logWarn('ensureNotificationsEventIdColumn failed', { err: err.message });
  }
}

// Get notifications for user
router.get('/notifications', async (req, res) => {
  try {
    const userId = req.user.id;
    const { notification_type, is_read, limit = 50, offset = 0 } = req.query;

    logInfo('Getting notifications', { userId, type: notification_type || 'all', is_read, limit });

    await ensureNotificationsEventIdColumn();

    // Check if notifications table exists, if not create it
    const result = await db.query(`
      SELECT
        n.id, n.notification_type, n.title, n.content,
        n.intimacy_request_id, n.event_id, n.is_read, n.read_at,
        n.created_at, n.priority,
        related_user.nickname as related_user_nickname
      FROM notifications n
      LEFT JOIN users related_user ON n.related_user_id = related_user.id
      WHERE n.user_id = $1
        AND ($2::text IS NULL OR n.notification_type = $2)
        AND ($3::boolean IS NULL OR n.is_read = $3)
      ORDER BY n.created_at DESC
      LIMIT $4 OFFSET $5
    `, [userId, notification_type || null, is_read === 'true' ? true : is_read === 'false' ? false : null, parseInt(limit), parseInt(offset)]).catch(async (error) => {
      if (error.message.includes('relation "notifications" does not exist')) {
        logInfo('Creating notifications table');
        
        // Create the notifications table
        await db.query(`
          CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            notification_type VARCHAR(50) NOT NULL,
            title VARCHAR(200) NOT NULL,
            content TEXT NOT NULL,
            intimacy_request_id UUID REFERENCES intimacy_requests(id) ON DELETE CASCADE,
            event_id UUID,
            related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            is_read BOOLEAN NOT NULL DEFAULT FALSE,
            read_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            priority INTEGER NOT NULL DEFAULT 1
          );
          
          CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
          CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
          CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
          CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
        `);

        logInfo('Notifications table created');
        
        // Return empty result since table was just created
        return { rows: [] };
      }
      throw error;
    });

    const notifications = result.rows.map(row => ({
      id: row.id,
      notification_type: row.notification_type,
      title: row.title,
      content: row.content,
      intimacy_request_id: row.intimacy_request_id,
      event_id: row.event_id,
      related_user_nickname: row.related_user_nickname,
      is_read: row.is_read,
      read_at: row.read_at,
      created_at: row.created_at,
      priority: row.priority
    }));

    logInfo('Notifications retrieved', { count: notifications.length });

    res.json({
      success: true,
      notifications
    });

  } catch (error) {
    logError('Get notifications failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取通知失敗',
      notifications: []
    });
  }
});

// Mark notifications as read
router.put('/notifications/mark-read', [
  body('notification_ids')
    .isArray({ min: 1 })
    .withMessage('至少需要提供一個通知ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logWarn('Mark notifications read validation failed', { userId: req.user?.id, errors: errors.array() });
      return res.status(400).json({
        success: false,
        message: '驗證失敗',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { notification_ids } = req.body;
    
    logInfo('Marking notifications as read', { userId, count: notification_ids.length });

    // Update notifications individually since PostgreSQL array handling can be complex
    let updatedCount = 0;
    for (const notificationId of notification_ids) {
      const result = await db.query(`
        UPDATE notifications 
        SET is_read = true, read_at = NOW() 
        WHERE user_id = $1 AND id = $2 AND is_read = false
        RETURNING id
      `, [userId, notificationId]);
      
      if (result.rows.length > 0) {
        updatedCount++;
      }
    }

    logInfo('Notifications marked as read', { userId, updatedCount });

    res.json({
      success: true,
      message: `已標記 ${updatedCount} 個通知為已讀`,
      updated_count: updatedCount
    });

  } catch (error) {
    logError('Mark notifications as read failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '標記通知為已讀失敗'
    });
  }
});

module.exports = router;
