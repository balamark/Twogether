const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { logInfo, logWarn, logError } = require('../lib/logger');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const { notifyPartnerAction, getPartnerId } = require('../services/notificationService');
const lineService = require('../services/lineService');
const llmService = require('../services/llmService');
const { resolveAiLimit, countTodayAiUsage, recordAiUsage } = require('../lib/aiUsage');
const { checkLimit } = require('../lib/entitlements');

const router = express.Router();

// 快速回應 — a record used to be a row nobody could answer. Now each person may
// leave one tap and one sentence on it. Only the KEY is stored; the zh-TW label
// lives here and in MOMENT_REACTIONS (src/components/MomentResponseBar.tsx) —
// keep the two lists in sync. No emoji: the label carries the meaning, and the
// record card stays quiet enough to read.
const MOMENT_REACTIONS = {
  love: '愛你',
  fire: '意猶未盡',
  hug: '想再抱一次',
  memorable: '很難忘',
};

// A quick response is a reply, not a diary entry — long thoughts belong in the
// record's own 備註. Matches the note column width in migration 086.
const NOTE_MAX = 80;

// All love moment routes require authentication
router.use(authenticateToken);

// Fetch quick responses for a set of moment ids → { momentId: [row, ...] }.
// Degrades to no responses (rather than failing the list) if the table isn't
// present yet, e.g. a pre-migration environment.
async function fetchResponsesForMoments(momentIds) {
  const map = {};
  if (!momentIds.length) return map;
  try {
    const result = await db.query(
      `SELECT r.moment_id, r.user_id, r.reaction, r.note, r.updated_at,
              u.nickname
         FROM love_moment_responses r
         JOIN users u ON u.id = r.user_id
        WHERE r.moment_id = ANY($1::uuid[])`,
      [momentIds]
    );
    for (const row of result.rows) {
      (map[row.moment_id] = map[row.moment_id] || []).push(row);
    }
  } catch (err) {
    logWarn('Failed to fetch love moment responses', { err: err.message });
  }
  return map;
}

// Digest the raw rows for one moment into "mine" and "theirs". Unlike the wall,
// this keys off the VIEWER rather than the author: both partners can respond to
// a moment, including whoever recorded it.
function digestResponses(rows, viewerId) {
  const shape = (r) => (r
    ? { reaction: r.reaction, note: r.note, nickname: r.nickname, updated_at: r.updated_at }
    : null);
  const list = rows || [];
  return {
    my_response: shape(list.find((r) => r.user_id === viewerId)),
    partner_response: shape(list.find((r) => r.user_id !== viewerId)),
  };
}

// Tell the other half their record got answered. Deliberately NOT routed
// through notifyPartnerAction: that helper always fans out to email, and
// emailing every one-tap chip is how a kind gesture turns into spam.
// In-app + LINE only.
async function notifyResponse(actorId, actorNickname, next) {
  try {
    const partnerId = await getPartnerId(actorId);
    if (!partnerId) return;

    const who = actorNickname || 'TA';
    const title = '對方回應了你們的記錄';
    const content = next.note
      ? `${who} 說：「${next.note}」`
      : `${who} 給了這則記錄一個「${MOMENT_REACTIONS[next.reaction]}」`;

    await db.query(
      `INSERT INTO notifications (
         user_id, notification_type, title, content, related_user_id, priority
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [partnerId, 'love_moment_response', title, content, actorId, 1]
    );

    lineService.pushToUserIfLinked(
      db,
      partnerId,
      `💌 Twogether｜${title}\n「${content}」\n👉 https://twogether.fun`
    );
  } catch (err) {
    logWarn('Failed to notify love moment response', { err: err.message });
  }
}

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

    // Resolve the photo's display URL so the just-created record shows its
    // photo immediately (the client also has it locally, but keep the response
    // self-consistent with GET).
    let photoUrl = null;
    if (moment.photo_id) {
      const pr = await db.query('SELECT file_path FROM photos WHERE id = $1', [moment.photo_id]);
      photoUrl = pr.rows[0]?.file_path || null;
    }

    logInfo('Love moment created', { momentId, coupleId, hasPhoto: !!moment.photo_id });

    // Let the partner know (in-app + LINE + email), best-effort.
    notifyPartnerAction({
      actorId: userId,
      type: 'love_moment_created',
      content: moment.description || moment.notes || moment.location || null,
    });

    res.status(201).json({
      success: true,
      message: '愛情時刻記錄成功',
      love_moment: {
        ...moment,
        photo_url: photoUrl,
        recorded_by: {
          id: userId,
          nickname: req.user.nickname
        }
      }
    });

  } catch (error) {
    logError('Create love moment failed', { err: error.message, stack: error.stack });
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
        p.file_path AS photo_url,
        u.id as recorded_by_id, u.nickname as recorded_by_nickname
      FROM love_moments lm
      JOIN users u ON lm.recorded_by = u.id
      LEFT JOIN photos p ON p.id = lm.photo_id
      ${whereClause}
      ORDER BY lm.moment_date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, queryParams);

    // One batched read for the whole page's 快速回應, digested per moment so the
    // UI never has to work out who is who.
    const responsesByMoment = await fetchResponsesForMoments(result.rows.map(r => r.id));

    const loveMoments = result.rows.map(row => ({
      id: row.id,
      moment_date: row.moment_date,
      notes: row.notes,
      description: row.description,
      duration: row.duration,
      location: row.location,
      roleplay_script: row.roleplay_script,
      photo_id: row.photo_id,
      photo_url: row.photo_url,
      created_at: row.created_at,
      recorded_by: {
        id: row.recorded_by_id,
        nickname: row.recorded_by_nickname
      },
      ...digestResponses(responsesByMoment[row.id], userId)
    }));

    res.json({
      success: true,
      love_moments: loveMoments,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (error) {
    logError('Get love moments failed', { err: error.message, stack: error.stack });
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
        p.file_path AS photo_url,
        u.id as recorded_by_id, u.nickname as recorded_by_nickname,
        c.id as couple_id
      FROM love_moments lm
      JOIN users u ON lm.recorded_by = u.id
      LEFT JOIN photos p ON p.id = lm.photo_id
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
    const responsesByMoment = await fetchResponsesForMoments([moment.id]);

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
        photo_url: moment.photo_url,
        created_at: moment.created_at,
        recorded_by: {
          id: moment.recorded_by_id,
          nickname: moment.recorded_by_nickname
        },
        ...digestResponses(responsesByMoment[moment.id], userId)
      }
    });

  } catch (error) {
    logError('Get love moment failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取愛情時刻失敗'
    });
  }
});

// Set, change or clear the caller's 快速回應 on a record. A partial update:
// a field absent from the body is left as it was, so tapping a chip never wipes
// the sentence the same person already left (and vice versa).
router.put('/:id/response', async (req, res) => {
  const userId = req.user.id;
  const momentId = req.params.id;

  try {
    const hasReaction = Object.prototype.hasOwnProperty.call(req.body || {}, 'reaction');
    const hasNote = Object.prototype.hasOwnProperty.call(req.body || {}, 'note');

    const rawReaction = req.body?.reaction;
    const reaction = rawReaction === null || rawReaction === undefined || rawReaction === ''
      ? null
      : String(rawReaction);

    if (reaction !== null && !MOMENT_REACTIONS[reaction]) {
      logWarn('love_moment.response.invalid', { user_id: userId, moment_id: momentId, reaction });
      return res.status(400).json({
        success: false,
        error_code: 'MOMENT_REACTION_INVALID',
        message: '這個回應已經不支援了，請重新選一個心意。',
      });
    }

    const rawNote = req.body?.note;
    const note = typeof rawNote === 'string' ? rawNote.trim() : null;

    if (note && [...note].length > NOTE_MAX) {
      logWarn('love_moment.response.note_too_long', {
        user_id: userId, moment_id: momentId, length: [...note].length,
      });
      return res.status(400).json({
        success: false,
        error_code: 'MOMENT_NOTE_TOO_LONG',
        message: `一句話回應最多 ${NOTE_MAX} 字。想說更多的話，寫進這則記錄的備註裡更適合。`,
      });
    }

    // Same visibility rule as GET /:id — your own record, or one belonging to
    // your couple. A miss is a 404 either way so ids can't be probed.
    const access = await db.query(`
      SELECT lm.id
        FROM love_moments lm
        LEFT JOIN couples c ON lm.couple_id = c.id
       WHERE lm.id = $1 AND (
         lm.recorded_by = $2 OR
         (c.id IS NOT NULL AND (c.user1_id = $2 OR c.user2_id = $2))
       )
    `, [momentId, userId]);

    if (access.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error_code: 'LOVE_MOMENT_NOT_FOUND',
        message: '找不到這則記錄，它可能已經被刪除了。',
      });
    }

    const existing = await db.query(
      'SELECT reaction, note FROM love_moment_responses WHERE moment_id = $1 AND user_id = $2',
      [momentId, userId]
    );
    const current = existing.rows[0] || { reaction: null, note: null };

    // Tapping the chip that's already lit means "take it back".
    let nextReaction = current.reaction;
    if (hasReaction) {
      nextReaction = reaction === null || reaction === current.reaction ? null : reaction;
    }
    let nextNote = current.note;
    if (hasNote) {
      nextNote = note || null;
    }

    const cleared = nextReaction === null && nextNote === null;

    if (cleared) {
      // Never store an empty row — that's what the CHECK in migration 086 guards.
      await db.query(
        'DELETE FROM love_moment_responses WHERE moment_id = $1 AND user_id = $2',
        [momentId, userId]
      );
    } else {
      await db.query(
        `INSERT INTO love_moment_responses (moment_id, user_id, reaction, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (moment_id, user_id)
         DO UPDATE SET reaction = EXCLUDED.reaction,
                       note = EXCLUDED.note,
                       updated_at = NOW()`,
        [momentId, userId, nextReaction, nextNote]
      );
    }

    logInfo('love_moment.response.set', {
      user_id: userId,
      moment_id: momentId,
      reaction: nextReaction,
      has_note: !!nextNote,
      cleared,
    });

    // Only something newly given is worth a ping — taking a response back isn't,
    // and neither is re-saving what was already there.
    const changed = nextReaction !== current.reaction || nextNote !== current.note;
    if (!cleared && changed) {
      await notifyResponse(userId, req.user.nickname, { reaction: nextReaction, note: nextNote });
    }

    const refreshed = await fetchResponsesForMoments([momentId]);
    res.json({ success: true, ...digestResponses(refreshed[momentId], userId) });

  } catch (error) {
    logDbError('Set love moment response error:', error, { user_id: userId, moment_id: momentId });
    res.status(500).json(errorResponseBody('無法送出回應，請稍後再試一次。', error));
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

    logInfo('Love moment updated', { momentId });

    notifyPartnerAction({
      actorId: userId,
      type: 'love_moment_updated',
      content: req.body.description || req.body.notes || req.body.location || null,
    });

    res.json({
      success: true,
      message: '愛情時刻更新成功'
    });

  } catch (error) {
    logError('Update love moment failed', { err: error.message, stack: error.stack });
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

    logInfo('Love moment deleted', { momentId });

    notifyPartnerAction({ actorId: userId, type: 'love_moment_deleted' });

    res.json({
      success: true,
      message: '愛情時刻刪除成功'
    });

  } catch (error) {
    logError('Delete love moment failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '刪除愛情時刻失敗'
    });
  }
});

// 今天你還喜歡他什麼？ — the "讓 AI 想幾個新的" escape hatch. The daily-question
// bank ships on the client; this asks the LLM for a fresh batch of natural,
// life-like questions when the couple doesn't vibe with the built-ins. Costs one
// AI credit (same daily pool as the icebreaker), so it's gated + logged.
router.post('/appreciation-questions', [
  body('avoid').optional().isArray(),
  body('avoid.*').optional().isString().isLength({ max: 200 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: '格式錯誤，請重新整理後再試', errors: errors.array() });
  }

  const userId = req.user.id;
  const avoid = Array.isArray(req.body.avoid) ? req.body.avoid.filter((q) => typeof q === 'string').slice(0, 40) : [];

  try {
    const { tier, limit } = await resolveAiLimit(userId);
    const usedToday = await countTodayAiUsage(userId);
    const limitCheck = checkLimit({ tier, key: 'icebreaker_per_day', used: usedToday });
    if (!limitCheck.ok) {
      logInfo('appreciation.questions.limit', { userId, used: usedToday, limit, tier, blocked: true });
      return res.status(limitCheck.status).json(limitCheck.body);
    }

    logInfo('appreciation.questions.input', { userId, avoidCount: avoid.length });

    const result = await llmService.generateAppreciationQuestions({ avoid });
    const meta = result._meta;
    delete result._meta;

    const questions = (result.questions || [])
      .map((q) => (typeof q === 'string' ? q.trim() : ''))
      .filter(Boolean);
    if (questions.length === 0) {
      logWarn('appreciation.questions.empty', { userId });
      return res.status(502).json({
        success: false,
        message: 'AI 一時想不出新問題，先用現有的問題，等等再試一次。',
        error_code: 'APPRECIATION_QUESTIONS_EMPTY',
      });
    }

    logInfo('appreciation.questions.cost', {
      userId,
      provider: meta?.provider,
      model: meta?.model,
      costUsd: meta?.costUsd,
      durationMs: meta?.durationMs,
      count: questions.length,
      usedToday: usedToday + 1,
      limit,
      tier,
    });

    await recordAiUsage(userId, 'appreciation_questions', JSON.stringify({ avoidCount: avoid.length }), meta);

    res.json({ success: true, questions });
  } catch (error) {
    logError('Generate appreciation questions failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'AI 暫時無法產生新問題，先用現有的問題，稍後再試一次。',
      error_code: 'APPRECIATION_QUESTIONS_FAILED',
    });
  }
});

module.exports = router;
