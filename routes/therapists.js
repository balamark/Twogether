// Human therapist (心理諮商師) directory + consultation requests.
//
// Two routers are exported:
//   - router:      public/JWT endpoints mounted at /api/therapists
//                  (browse approved therapists, apply to join, request a
//                   consultation, list my own consultations/applications)
//   - adminRouter: Basic-Auth gated endpoints mounted at /api/admin/therapists
//                  (list pending applications, approve/reject)
//
// This is the "talk to a real human" option that sits alongside the existing
// (cheaper) AI rephrase feature — the AI flow is untouched.

const express = require('express');
const { body, query: queryValidator, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();
const adminRouter = express.Router();

const FOCUS_AREAS = [
  'family',      // 家庭
  'couple',      // 伴侶
  'childhood',   // 童年/原生家庭
  'individual',  // 個人成長
  'sexuality',   // 性與親密
  'parenting',   // 親職
  'grief',       // 悲傷失落
  'anxiety',     // 焦慮憂鬱
];

// Shape the public-facing therapist object. Never leaks license_no /
// contact_* — those are private to the applicant and admins.
const toPublicTherapist = (row) => ({
  id: row.id,
  displayName: row.display_name,
  title: row.title,
  focusAreas: row.focus_areas || [],
  languages: row.languages || [],
  yearsExperience: row.years_experience,
  bio: row.bio,
  photoUrl: row.photo_url,
  rateTwd: row.rate_twd,
  sessionMinutes: row.session_minutes,
  createdAt: row.created_at,
});

const sanitizeStringArray = (value, allowList) => {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  const unique = [...new Set(cleaned)];
  return allowList ? unique.filter((v) => allowList.includes(v)) : unique;
};

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: '驗證失敗', errors: errors.array() });
    return false;
  }
  return true;
};

// Resolve a consultation row and decide whether `userId` may take part in its
// chat. A participant is the requester, a member of the consultation's couple
// (so BOTH partners can join the room), or the therapist's linked user account.
// Returns null when the consultation doesn't exist.
const loadConsultationAccess = async (consultationId, userId) => {
  const result = await db.query(`
    SELECT
      tc.id, tc.therapist_id, tc.requester_id, tc.couple_id, tc.status,
      t.user_id AS therapist_user_id, t.display_name AS therapist_name,
      c.user1_id, c.user2_id
    FROM therapist_consultations tc
    JOIN therapists t ON t.id = tc.therapist_id
    LEFT JOIN couples c ON c.id = tc.couple_id
    WHERE tc.id = $1
  `, [consultationId]);
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  const isTherapist = Boolean(r.therapist_user_id) && r.therapist_user_id === userId;
  const isCoupleMember = r.user1_id === userId || r.user2_id === userId;
  const isParticipant = Boolean(isTherapist || isCoupleMember || r.requester_id === userId);
  return { row: r, isParticipant, isTherapist, role: isTherapist ? 'therapist' : 'client' };
};

// --- Public browse -------------------------------------------------------

// GET /api/therapists?focus=couple
// List approved therapists, optionally filtered to one focus area.
router.get('/', optionalAuth, [
  queryValidator('focus').optional().isIn(FOCUS_AREAS).withMessage('focus 無效'),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const { focus } = req.query;
    const params = [];
    let sql = `SELECT * FROM therapists WHERE status = 'approved'`;
    if (focus) {
      params.push(focus);
      sql += ` AND $${params.length} = ANY(focus_areas)`;
    }
    sql += ` ORDER BY created_at DESC`;
    const result = await db.query(sql, params);
    res.json({ success: true, therapists: result.rows.map(toPublicTherapist) });
  } catch (error) {
    logError('Failed to list therapists', { err: error.message });
    res.status(500).json({ success: false, message: '無法取得諮商師列表' });
  }
});

// GET /api/therapists/focus-areas — the canonical list (for filter chips).
router.get('/focus-areas', (req, res) => {
  res.json({ success: true, focusAreas: FOCUS_AREAS });
});

// GET /api/therapists/consultations/mine — my consultation requests.
// Defined before /:id so "consultations" isn't captured as an id.
router.get('/consultations/mine', authenticateToken, async (req, res) => {
  try {
    // Include consultations I requested, ones my partner requested (same
    // couple), AND ones booked with me if I'm a therapist. `role` tells the UI
    // which side of the conversation the current user is on.
    const result = await db.query(`
      SELECT
        tc.id, tc.focus_area, tc.message, tc.preferred_time, tc.status,
        tc.responded_at, tc.response_note, tc.created_at,
        t.display_name AS therapist_name, t.title AS therapist_title,
        t.user_id AS therapist_user_id,
        requester.nickname AS requester_name,
        (SELECT COUNT(*) FROM consultation_messages cm WHERE cm.consultation_id = tc.id) AS message_count
      FROM therapist_consultations tc
      JOIN therapists t ON t.id = tc.therapist_id
      JOIN users requester ON requester.id = tc.requester_id
      LEFT JOIN couples c ON c.id = tc.couple_id
      WHERE tc.requester_id = $1
         OR c.user1_id = $1
         OR c.user2_id = $1
         OR t.user_id = $1
      ORDER BY tc.created_at DESC
    `, [req.user.id]);
    res.json({
      success: true,
      consultations: result.rows.map((r) => ({
        id: r.id,
        therapistName: r.therapist_name,
        therapistTitle: r.therapist_title,
        requesterName: r.requester_name,
        role: r.therapist_user_id && r.therapist_user_id === req.user.id ? 'therapist' : 'client',
        focusArea: r.focus_area,
        message: r.message,
        preferredTime: r.preferred_time,
        status: r.status,
        respondedAt: r.responded_at,
        responseNote: r.response_note,
        messageCount: Number(r.message_count) || 0,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    logError('Failed to list my consultations', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '無法取得預約紀錄' });
  }
});

// GET /api/therapists/consultations/:id/messages — the group-chat log for a
// consultation room. Participants only.
router.get('/consultations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const access = await loadConsultationAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這個諮商室' });
    if (!access.isParticipant) return res.status(403).json({ success: false, message: '你沒有權限進入這個諮商室' });

    const msgs = await db.query(`
      SELECT cm.id, cm.sender_id, cm.body, cm.event_id, cm.created_at,
             u.nickname AS sender_name,
             e.title AS event_title, e.summary AS event_summary
      FROM consultation_messages cm
      JOIN users u ON u.id = cm.sender_id
      LEFT JOIN events e ON e.id = cm.event_id
      WHERE cm.consultation_id = $1
      ORDER BY cm.created_at ASC
    `, [req.params.id]);

    const therapistUserId = access.row.therapist_user_id;
    res.json({
      success: true,
      role: access.role,
      therapistName: access.row.therapist_name,
      currentUserId: req.user.id,
      messages: msgs.rows.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        body: m.body,
        createdAt: m.created_at,
        isTherapist: Boolean(therapistUserId) && m.sender_id === therapistUserId,
        isMine: m.sender_id === req.user.id,
        event: m.event_id ? { id: m.event_id, title: m.event_title, summary: m.event_summary } : null,
      })),
    });
  } catch (error) {
    logError('Failed to load consultation messages', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '無法載入訊息' });
  }
});

// POST /api/therapists/consultations/:id/messages — post a chat message,
// optionally anchored to one of the couple's recorded events.
router.post('/consultations/:id/messages', authenticateToken, [
  body('body').isString().trim().isLength({ min: 1, max: 2000 }).withMessage('訊息長度需為 1-2000 字'),
  body('eventId').optional({ nullable: true }).isUUID().withMessage('eventId 無效'),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const access = await loadConsultationAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這個諮商室' });
    if (!access.isParticipant) return res.status(403).json({ success: false, message: '你沒有權限在這個諮商室發言' });

    let eventId = req.body.eventId || null;
    if (eventId) {
      // Only let a message reference an event that belongs to this room's couple.
      const ev = await db.query(
        `SELECT id FROM events WHERE id = $1 AND couple_id = $2`,
        [eventId, access.row.couple_id]
      );
      if (ev.rows.length === 0) {
        return res.status(400).json({ success: false, message: '引用的事件無效' });
      }
    }

    const ins = await db.query(
      `INSERT INTO consultation_messages (consultation_id, sender_id, body, event_id)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [req.params.id, req.user.id, req.body.body.trim(), eventId]
    );
    logInfo('Consultation message posted', { consultationId: req.params.id, userId: req.user.id });
    res.status(201).json({
      success: true,
      message: { id: ins.rows[0].id, createdAt: ins.rows[0].created_at },
    });
  } catch (error) {
    logError('Failed to post consultation message', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '送出訊息失敗' });
  }
});

// POST /api/therapists/consultations/:id/respond — the therapist accepts /
// declines / completes a consultation. Therapist (linked user) only.
router.post('/consultations/:id/respond', authenticateToken, [
  body('action').isIn(['accept', 'decline', 'complete']).withMessage('action 無效'),
  body('note').optional({ nullable: true }).isString().isLength({ max: 1000 }),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const access = await loadConsultationAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這個預約' });
    if (!access.isTherapist) return res.status(403).json({ success: false, message: '只有諮商師可以回覆預約' });

    const statusMap = { accept: 'accepted', decline: 'declined', complete: 'completed' };
    const status = statusMap[req.body.action];
    const result = await db.query(
      `UPDATE therapist_consultations
          SET status = $1, response_note = $2, responded_at = NOW()
        WHERE id = $3 RETURNING id, status`,
      [status, req.body.note || null, req.params.id]
    );
    res.json({ success: true, consultation: result.rows[0] });
  } catch (error) {
    logError('Failed to respond to consultation', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '回覆預約失敗' });
  }
});

// GET /api/therapists/applications/mine — application status for the logged-in
// user (so an applicant can see "審核中 / 已通過 / 未通過").
router.get('/applications/mine', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, display_name, status, review_note, created_at, reviewed_at
         FROM therapists WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({
      success: true,
      applications: result.rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        status: r.status,
        reviewNote: r.review_note,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
      })),
    });
  } catch (error) {
    logError('Failed to list my applications', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '無法取得申請紀錄' });
  }
});

// GET /api/therapists/:id — single approved therapist.
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM therapists WHERE id = $1 AND status = 'approved'`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到這位諮商師' });
    }
    res.json({ success: true, therapist: toPublicTherapist(result.rows[0]) });
  } catch (error) {
    logError('Failed to fetch therapist', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '無法取得諮商師資料' });
  }
});

// --- Apply to become a therapist ----------------------------------------

// POST /api/therapists/apply
// optionalAuth: a logged-in user gets linked via user_id, but anyone can apply.
router.post('/apply', optionalAuth, [
  body('displayName').isString().trim().isLength({ min: 1, max: 120 }).withMessage('請填寫姓名'),
  body('title').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('licenseNo').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('focusAreas').isArray({ min: 1 }).withMessage('請至少選擇一個專長領域'),
  body('languages').optional().isArray(),
  body('yearsExperience').optional({ nullable: true }).isInt({ min: 0, max: 80 }).withMessage('年資無效'),
  body('bio').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('photoUrl').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  body('rateTwd').isInt({ min: 0, max: 100000 }).withMessage('費率無效'),
  body('sessionMinutes').optional().isInt({ min: 10, max: 240 }).withMessage('時長無效'),
  body('contactEmail').isEmail().withMessage('請填寫有效的聯絡 Email'),
  body('contactPhone').optional({ nullable: true }).isString().isLength({ max: 40 }),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const {
      displayName, title, licenseNo, languages, yearsExperience,
      bio, photoUrl, rateTwd, sessionMinutes, contactEmail, contactPhone,
    } = req.body;

    const focusAreas = sanitizeStringArray(req.body.focusAreas, FOCUS_AREAS);
    if (focusAreas.length === 0) {
      return res.status(400).json({ success: false, message: '請至少選擇一個有效的專長領域' });
    }
    const langs = sanitizeStringArray(languages);

    const userId = req.user ? req.user.id : null;

    const result = await db.query(`
      INSERT INTO therapists
        (user_id, display_name, title, license_no, focus_areas, languages,
         years_experience, bio, photo_url, rate_twd, session_minutes,
         contact_email, contact_phone, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
      RETURNING id, status, created_at
    `, [
      userId, displayName.trim(), title || null, licenseNo || null, focusAreas, langs,
      yearsExperience ?? null, bio || null, photoUrl || null, rateTwd,
      sessionMinutes ?? 50, contactEmail.trim(), contactPhone || null,
    ]);

    logInfo('Therapist application submitted', { userId, therapistId: result.rows[0].id });
    res.status(201).json({
      success: true,
      message: '申請已送出，我們會在審核後與你聯繫',
      application: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    logError('Failed to submit therapist application', { err: error.message });
    res.status(500).json({ success: false, message: '送出申請失敗，請稍後再試' });
  }
});

// --- Request a consultation ---------------------------------------------

// POST /api/therapists/:id/consult — logged-in user books a chat with a
// therapist. Records couple_id when the requester is paired.
router.post('/:id/consult', authenticateToken, [
  body('focusArea').optional({ nullable: true }).isIn(FOCUS_AREAS).withMessage('focusArea 無效'),
  body('message').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('contactEmail').optional({ nullable: true }).isEmail().withMessage('Email 格式錯誤'),
  body('preferredTime').optional({ nullable: true }).isISO8601().withMessage('時間格式錯誤'),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const therapistId = req.params.id;
    const userId = req.user.id;

    const therapist = await db.query(
      `SELECT id FROM therapists WHERE id = $1 AND status = 'approved'`,
      [therapistId]
    );
    if (therapist.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到這位諮商師' });
    }

    // Record the couple if the requester is paired (either side of the couple).
    const couple = await db.query(
      `SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1 LIMIT 1`,
      [userId]
    );
    const coupleId = couple.rows[0] ? couple.rows[0].id : null;

    const { focusArea, message, contactEmail, preferredTime } = req.body;

    const result = await db.query(`
      INSERT INTO therapist_consultations
        (therapist_id, requester_id, couple_id, focus_area, message,
         contact_email, preferred_time)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, status, created_at
    `, [
      therapistId, userId, coupleId, focusArea || null, message || null,
      contactEmail || req.user.email || null, preferredTime || null,
    ]);

    logInfo('Consultation requested', { userId, therapistId, consultationId: result.rows[0].id });
    res.status(201).json({
      success: true,
      message: '預約已送出，諮商師將盡快與你聯繫',
      consultation: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    logError('Failed to request consultation', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '預約失敗，請稍後再試' });
  }
});

// --- Admin moderation (Basic-Auth gated in server.js) -------------------

// GET /api/admin/therapists?status=pending — review queue.
adminRouter.get('/', async (req, res) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status)
      ? req.query.status : 'pending';
    const result = await db.query(
      `SELECT * FROM therapists WHERE status = $1 ORDER BY created_at DESC`,
      [status]
    );
    res.json({ success: true, therapists: result.rows });
  } catch (error) {
    logError('Admin: failed to list therapists', { err: error.message });
    res.status(500).json({ success: false, message: 'Failed to list therapists' });
  }
});

// POST /api/admin/therapists/:id/review { action: 'approve'|'reject', note }
adminRouter.post('/:id/review', express.json(), async (req, res) => {
  try {
    const action = req.body && req.body.action;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'" });
    }
    const status = action === 'approve' ? 'approved' : 'rejected';
    const result = await db.query(
      `UPDATE therapists
          SET status = $1, review_note = $2, reviewed_at = NOW(), updated_at = NOW()
        WHERE id = $3
        RETURNING id, status`,
      [status, (req.body && req.body.note) || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Therapist not found' });
    }
    logInfo('Admin reviewed therapist', { id: req.params.id, status });
    res.json({ success: true, therapist: result.rows[0] });
  } catch (error) {
    logError('Admin: failed to review therapist', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: 'Failed to review therapist' });
  }
});

module.exports = { router, adminRouter, FOCUS_AREAS };
