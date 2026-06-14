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
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { body, query: queryValidator, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken, optionalAuth, generateToken } = require('../middleware/auth');
const { uploadToSupabase } = require('../lib/supabase-storage');
const emailService = require('../services/emailService');
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
  'depression',  // 憂鬱情緒
  'trauma',      // 創傷
  'addiction',   // 成癮
  'lgbtq',       // 性別與多元認同
  'career',      // 職涯/工作壓力
  'self_esteem', // 自我價值
];

// Free-text custom specialties: how many a therapist may add and how long each
// can be. Kept small so the browse card stays readable and the column doesn't
// become a dumping ground.
const MAX_CUSTOM_SPECIALTIES = 8;
const MAX_CUSTOM_SPECIALTY_LEN = 40;

// Generate a human-friendly temporary password for an auto-provisioned
// therapist account: 12 url-safe chars with no ambiguous 0/O/1/l/I.
const generateTempPassword = () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

// Shape the public-facing therapist object. Never leaks license_no /
// contact_* — those are private to the applicant and admins.
const toPublicTherapist = (row) => ({
  id: row.id,
  displayName: row.display_name,
  title: row.title,
  focusAreas: row.focus_areas || [],
  customSpecialties: row.custom_specialties || [],
  languages: row.languages || [],
  yearsExperience: row.years_experience,
  bio: row.bio,
  photoUrl: row.photo_url,
  rateTwd: row.rate_twd,
  sessionMinutes: row.session_minutes,
  identityStatus: row.identity_status,
  createdAt: row.created_at,
});

// The therapist's own (private) view of their profile — includes contact info,
// verification + identity state, and moderation status so they understand where
// their application stands.
const toOwnTherapist = (row) => ({
  ...toPublicTherapist(row),
  licenseNo: row.license_no,
  contactEmail: row.contact_email,
  contactPhone: row.contact_phone,
  status: row.status,
  reviewNote: row.review_note,
  emailVerified: row.email_verified,
  identityDocuments: row.identity_documents || [],
  identityStatus: row.identity_status,
});

const sanitizeStringArray = (value, allowList) => {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  const unique = [...new Set(cleaned)];
  return allowList ? unique.filter((v) => allowList.includes(v)) : unique;
};

// Normalise free-text custom specialties: trim, drop empties, de-dupe, clamp
// each to MAX_CUSTOM_SPECIALTY_LEN and the list to MAX_CUSTOM_SPECIALTIES.
const sanitizeCustomSpecialties = (value) => {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((v) => (typeof v === 'string' ? v.trim().slice(0, MAX_CUSTOM_SPECIALTY_LEN) : ''))
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, MAX_CUSTOM_SPECIALTIES);
};

// In-memory per-IP rate limit for the public (no-login) upload endpoints used
// by the therapist sign-up form. Sliding 1-minute window. Keeps an anonymous
// flood from filling storage without needing a dependency.
const UPLOAD_RL_WINDOW_MS = 60_000;
const UPLOAD_RL_MAX = 12;
const uploadHits = new Map(); // ip -> number[]
const uploadRateLimited = (ip) => {
  if (!ip) return false;
  const now = Date.now();
  const cutoff = now - UPLOAD_RL_WINDOW_MS;
  const hits = (uploadHits.get(ip) || []).filter((t) => t > cutoff);
  if (hits.length >= UPLOAD_RL_MAX) {
    uploadHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  uploadHits.set(ip, hits);
  return false;
};

// multer in-memory storage for therapist photo + document uploads.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|webp)$/i)) {
      return cb(new Error('大頭照只接受 jpg、jpeg、png、webp 圖片格式'), false);
    }
    cb(null, true);
  },
});
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|webp|pdf)$/i)) {
      return cb(new Error('證明文件只接受 jpg、jpeg、png、webp 或 pdf 格式'), false);
    }
    cb(null, true);
  },
});

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

// --- Uploads (public, used by the no-login sign-up form) -----------------

// Shared handler: process an uploaded buffer and push it to Supabase storage,
// returning the public URL. Photos are resized; documents (incl. PDFs) are
// stored as-is. Filenames are random UUIDs so document URLs aren't guessable.
const handleUpload = async (req, res, { kind }) => {
  try {
    if (uploadRateLimited(req.ip)) {
      return res.status(429).json({
        success: false,
        error_code: 'UPLOAD_RATE_LIMITED',
        message: '上傳太頻繁了，請稍等一分鐘再試',
      });
    }
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error_code: 'NO_FILE',
        message: kind === 'photo' ? '請選擇要上傳的大頭照' : '請選擇要上傳的證明文件',
      });
    }

    const ext = (req.file.originalname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    let buffer = req.file.buffer;
    let mimeType = req.file.mimetype;
    let outExt = ext;

    if (kind === 'photo' && ext !== 'gif') {
      // Normalise photos to a reasonable size + JPEG to keep storage small.
      buffer = await sharp(req.file.buffer)
        .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();
      mimeType = 'image/jpeg';
      outExt = 'jpg';
    } else if (kind === 'document' && ext === 'pdf') {
      mimeType = 'application/pdf';
    }

    const fileName = `therapist-${kind}/${uuidv4()}-${Date.now()}.${outExt}`;
    const url = await uploadToSupabase(buffer, fileName, mimeType);
    logInfo('Therapist asset uploaded', { kind, ip: req.ip });
    return res.status(201).json({ success: true, url });
  } catch (error) {
    logError('Therapist upload failed', { kind, err: error.message });
    return res.status(500).json({
      success: false,
      error_code: 'UPLOAD_FAILED',
      message: error.message || '上傳失敗，請稍後再試',
    });
  }
};

// POST /api/therapists/upload-photo — profile picture (multipart, field "photo").
router.post('/upload-photo', (req, res) => {
  photoUpload.single('photo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error_code: 'UPLOAD_REJECTED', message: err.message });
    }
    handleUpload(req, res, { kind: 'photo' });
  });
});

// POST /api/therapists/upload-document — credential/identity doc (field "document").
router.post('/upload-document', (req, res) => {
  documentUpload.single('document')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error_code: 'UPLOAD_REJECTED', message: err.message });
    }
    handleUpload(req, res, { kind: 'document' });
  });
});

// --- Email verification (public link target) ----------------------------

// GET /api/therapists/verify-email?token=… — clicked from the verification
// email. Flips email_verified true and shows a small confirmation page.
router.get('/verify-email', async (req, res) => {
  const renderPage = (ok, message) => {
    res.status(ok ? 200 : 400).type('html').send(`<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Email 驗證 · Twogether</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif;background:#fbf7f2;color:#2a2422;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.card{background:#fff;border:1px solid #e4dccf;border-radius:14px;padding:36px 32px;max-width:420px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.emoji{font-size:44px}h1{font-size:22px;font-weight:500;margin:14px 0 8px}p{color:#8a807c;font-size:15px;line-height:1.6;margin:0 0 20px}
a{display:inline-block;background:#2a2422;color:#fbf7f2;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px}</style>
</head><body><div class="card"><div class="emoji">${ok ? '✅' : '⚠️'}</div>
<h1>${ok ? 'Email 已驗證' : '驗證失敗'}</h1><p>${message}</p>
<a href="/">回到 Twogether</a></div></body></html>`);
  };

  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) return renderPage(false, '驗證連結無效，缺少驗證碼。');

    const result = await db.query(
      `UPDATE therapists
          SET email_verified = true, email_verification_token = NULL, updated_at = NOW()
        WHERE email_verification_token = $1
        RETURNING id, display_name`,
      [token]
    );
    if (result.rows.length === 0) {
      return renderPage(false, '這個驗證連結已失效或已經使用過了。如果你已驗證過，可以直接登入。');
    }
    logInfo('Therapist email verified', { therapistId: result.rows[0].id });
    return renderPage(true, '謝謝你！你的 Email 已完成驗證。我們會在審核通過後與你聯繫，你也可以登入編輯個人檔案。');
  } catch (error) {
    logError('Therapist email verification failed', { err: error.message });
    return renderPage(false, '驗證時發生錯誤，請稍後再試。');
  }
});

// --- Self-service therapist profile (logged-in therapist) ----------------

// Load the therapist profile linked to a user id (newest first), any status.
const loadOwnTherapist = async (userId) => {
  const result = await db.query(
    `SELECT * FROM therapists WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
};

// GET /api/therapists/me — the logged-in user's own therapist profile, if any.
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const row = await loadOwnTherapist(req.user.id);
    if (!row) {
      return res.status(404).json({ success: false, error_code: 'NO_THERAPIST_PROFILE', message: '你還沒有諮商師檔案' });
    }
    res.json({ success: true, therapist: toOwnTherapist(row) });
  } catch (error) {
    logError('Failed to load own therapist profile', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '無法取得諮商師檔案' });
  }
});

// PUT /api/therapists/me — the therapist edits their own profile. Editing never
// changes their moderation status; a suspended/rejected therapist can still fix
// their details, but the listing only reappears once an admin re-approves.
router.put('/me', authenticateToken, [
  body('displayName').optional().isString().trim().isLength({ min: 1, max: 120 }).withMessage('姓名長度需為 1-120 字'),
  body('title').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('focusAreas').optional().isArray({ min: 1 }).withMessage('請至少選擇一個專長領域'),
  body('customSpecialties').optional().isArray(),
  body('languages').optional().isArray(),
  body('yearsExperience').optional({ nullable: true }).isInt({ min: 0, max: 80 }).withMessage('年資無效'),
  body('bio').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('photoUrl').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  body('rateTwd').optional().isInt({ min: 0, max: 100000 }).withMessage('費率無效'),
  body('sessionMinutes').optional().isInt({ min: 10, max: 240 }).withMessage('時長無效'),
  body('contactPhone').optional({ nullable: true }).isString().isLength({ max: 40 }),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const existing = await loadOwnTherapist(req.user.id);
    if (!existing) {
      return res.status(404).json({ success: false, error_code: 'NO_THERAPIST_PROFILE', message: '你還沒有諮商師檔案，請先申請成為諮商師' });
    }

    // Build a partial update from only the fields that were provided. Each
    // entry maps a request field to its column + (optional) sanitiser.
    const updates = [];
    const params = [];
    const push = (col, val) => { params.push(val); updates.push(`${col} = $${params.length}`); };

    if (req.body.displayName !== undefined) push('display_name', req.body.displayName.trim());
    if (req.body.title !== undefined) push('title', req.body.title || null);
    if (req.body.focusAreas !== undefined) {
      const focusAreas = sanitizeStringArray(req.body.focusAreas, FOCUS_AREAS);
      if (focusAreas.length === 0) {
        return res.status(400).json({ success: false, error_code: 'NO_FOCUS_AREA', message: '請至少選擇一個有效的專長領域' });
      }
      push('focus_areas', focusAreas);
    }
    if (req.body.customSpecialties !== undefined) push('custom_specialties', sanitizeCustomSpecialties(req.body.customSpecialties));
    if (req.body.languages !== undefined) push('languages', sanitizeStringArray(req.body.languages));
    if (req.body.yearsExperience !== undefined) push('years_experience', req.body.yearsExperience ?? null);
    if (req.body.bio !== undefined) push('bio', req.body.bio || null);
    if (req.body.photoUrl !== undefined) push('photo_url', req.body.photoUrl || null);
    if (req.body.rateTwd !== undefined) push('rate_twd', req.body.rateTwd);
    if (req.body.sessionMinutes !== undefined) push('session_minutes', req.body.sessionMinutes);
    if (req.body.contactPhone !== undefined) push('contact_phone', req.body.contactPhone || null);

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error_code: 'NO_CHANGES', message: '沒有要更新的欄位' });
    }

    params.push(existing.id);
    const result = await db.query(
      `UPDATE therapists SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length} RETURNING *`,
      params
    );
    logInfo('Therapist profile self-updated', { userId: req.user.id, therapistId: existing.id });
    res.json({ success: true, message: '檔案已更新', therapist: toOwnTherapist(result.rows[0]) });
  } catch (error) {
    logError('Failed to update own therapist profile', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '更新檔案失敗，請稍後再試' });
  }
});

// POST /api/therapists/me/documents — the logged-in therapist appends an
// identity/credential document URL (already uploaded via /upload-document).
router.post('/me/documents', authenticateToken, [
  body('url').isString().trim().isLength({ min: 1, max: 1000 }).withMessage('文件網址無效'),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const existing = await loadOwnTherapist(req.user.id);
    if (!existing) {
      return res.status(404).json({ success: false, error_code: 'NO_THERAPIST_PROFILE', message: '你還沒有諮商師檔案' });
    }
    const result = await db.query(
      `UPDATE therapists
          SET identity_documents = array_append(identity_documents, $1),
              identity_status = 'submitted', updated_at = NOW()
        WHERE id = $2 RETURNING *`,
      [req.body.url.trim(), existing.id]
    );
    logInfo('Therapist document submitted', { userId: req.user.id, therapistId: existing.id });
    res.status(201).json({ success: true, message: '文件已上傳，等待管理員審核', therapist: toOwnTherapist(result.rows[0]) });
  } catch (error) {
    logError('Failed to add therapist document', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '上傳文件失敗，請稍後再試' });
  }
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
// optionalAuth: a logged-in user gets linked via user_id. Anyone can apply
// without an account — we provision one for them so they can log in, edit their
// profile, and manage consultations. The response tells the applicant exactly
// how to log in (their email, plus a generated password for brand-new accounts).
router.post('/apply', optionalAuth, [
  body('displayName').isString().trim().isLength({ min: 1, max: 120 }).withMessage('請填寫姓名'),
  body('title').optional({ nullable: true }).isString().isLength({ max: 120 }),
  body('licenseNo').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('focusAreas').isArray({ min: 1 }).withMessage('請至少選擇一個專長領域'),
  body('customSpecialties').optional().isArray(),
  body('languages').optional().isArray(),
  body('yearsExperience').optional({ nullable: true }).isInt({ min: 0, max: 80 }).withMessage('年資無效'),
  body('bio').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('photoUrl').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  body('identityDocuments').optional().isArray(),
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
      return res.status(400).json({ success: false, error_code: 'NO_FOCUS_AREA', message: '請至少選擇一個有效的專長領域' });
    }
    const langs = sanitizeStringArray(languages);
    const customSpecialties = sanitizeCustomSpecialties(req.body.customSpecialties);
    const identityDocuments = sanitizeStringArray(req.body.identityDocuments).slice(0, 10);
    // Keep the email exactly as entered (trimmed) to match the case-sensitive
    // register/login flow — so the credentials we hand back log in cleanly.
    const email = contactEmail.trim();

    // --- Resolve / provision the therapist's user account ------------------
    // Priority: an already-logged-in user → reuse. Else an existing account
    // matching the contact email → link (don't reset their password). Else
    // create a fresh account and hand back generated credentials.
    let userId = req.user ? req.user.id : null;
    let credentials = null;          // { email, password } for brand-new accounts
    let accountExisted = false;      // true when we linked to a pre-existing login

    if (!userId) {
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        accountExisted = true;
      } else {
        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 12);
        const newId = uuidv4();
        const now = new Date().toISOString();
        // nickname must satisfy the 2-50 char rule used elsewhere; clamp.
        const nickname = displayName.trim().slice(0, 50).padEnd(2, '　');
        const created = await db.query(
          `INSERT INTO users (id, nickname, email, password_hash, created_at, last_login)
           VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
          [newId, nickname, email, passwordHash, now]
        );
        userId = created.rows[0].id;
        credentials = { email, password: tempPassword };
      }
    }

    // Block a duplicate active profile for the same account so /me stays
    // unambiguous and admins don't see dupes. Rejected ones can be re-applied.
    if (userId) {
      const dupe = await db.query(
        `SELECT id, status FROM therapists
          WHERE user_id = $1 AND status IN ('pending','approved','suspended')
          ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (dupe.rows.length > 0) {
        logInfo('Therapist apply blocked: existing profile', { userId, status: dupe.rows[0].status });
        return res.status(409).json({
          success: false,
          error_code: 'THERAPIST_PROFILE_EXISTS',
          message: '這個帳號已經有一份諮商師申請或檔案了。請登入後到「我的諮商師檔案」編輯，不需重複申請。',
        });
      }
    }

    // Email verification token — emailed to the contact address. We mark the
    // profile verified only after they click the link.
    const verifyToken = crypto.randomBytes(24).toString('hex');
    const identityStatus = identityDocuments.length > 0 ? 'submitted' : 'unverified';

    const result = await db.query(`
      INSERT INTO therapists
        (user_id, display_name, title, license_no, focus_areas, custom_specialties,
         languages, years_experience, bio, photo_url, rate_twd, session_minutes,
         contact_email, contact_phone, identity_documents, identity_status,
         email_verification_token, email_verification_sent_at, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),'pending')
      RETURNING id, status, created_at
    `, [
      userId, displayName.trim(), title || null, licenseNo || null, focusAreas, customSpecialties,
      langs, yearsExperience ?? null, bio || null, photoUrl || null, rateTwd,
      sessionMinutes ?? 50, email, contactPhone || null, identityDocuments, identityStatus,
      verifyToken,
    ]);

    // Fire-and-forget the verification email — sign-up must succeed even if SMTP
    // is down. The applicant still gets their credentials in the response.
    emailService.sendTherapistEmailVerification({
      recipientEmail: email,
      displayName: displayName.trim(),
      token: verifyToken,
    }).catch((err) => logWarn('Therapist verification email failed', { err: err.message }));

    logInfo('Therapist application submitted', {
      userId, therapistId: result.rows[0].id, accountCreated: !!credentials, accountExisted,
    });

    res.status(201).json({
      success: true,
      message: '申請已送出，我們會在審核後與你聯繫',
      application: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        createdAt: result.rows[0].created_at,
      },
      // Login guidance for the applicant. `credentials` is only present for a
      // freshly-created account; never echo a password for an existing login.
      account: {
        email,
        created: !!credentials,
        existed: accountExisted,
        password: credentials ? credentials.password : null,
      },
      emailVerificationSent: true,
    });
  } catch (error) {
    logError('Failed to submit therapist application', { err: error.message, stack: error.stack });
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

// GET /api/admin/therapists?status=pending — review queue. 'suspended' is a
// valid filter so admins can find and reactivate paused therapists.
adminRouter.get('/', async (req, res) => {
  try {
    const status = ['pending', 'approved', 'rejected', 'suspended'].includes(req.query.status)
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

// POST /api/admin/therapists/:id/review
//   { action: 'approve'|'reject'|'suspend'|'reactivate', note }
//   - approve    : pending/suspended → approved (visible in browse)
//   - reject     : → rejected (never approved, or removed from the listing)
//   - suspend    : approved → suspended (temporarily hidden, recoverable)
//   - reactivate : suspended → approved (un-pause)
const REVIEW_STATUS = {
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
  reactivate: 'approved',
};
adminRouter.post('/:id/review', express.json(), async (req, res) => {
  try {
    const action = req.body && req.body.action;
    const status = REVIEW_STATUS[action];
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "action must be one of 'approve' | 'reject' | 'suspend' | 'reactivate'",
      });
    }
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
    logInfo('Admin reviewed therapist', { id: req.params.id, action, status });
    res.json({ success: true, therapist: result.rows[0] });
  } catch (error) {
    logError('Admin: failed to review therapist', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: 'Failed to review therapist' });
  }
});

// POST /api/admin/therapists/:id/verify-identity { action: 'verify'|'reject', note }
// Admin confirms or rejects the uploaded credential documents, independent of
// the listing status.
adminRouter.post('/:id/verify-identity', express.json(), async (req, res) => {
  try {
    const action = req.body && req.body.action;
    if (!['verify', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'verify' or 'reject'" });
    }
    const identityStatus = action === 'verify' ? 'verified' : 'rejected';
    const result = await db.query(
      `UPDATE therapists SET identity_status = $1, updated_at = NOW()
        WHERE id = $2 RETURNING id, identity_status`,
      [identityStatus, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Therapist not found' });
    }
    logInfo('Admin reviewed therapist identity', { id: req.params.id, identityStatus });
    res.json({ success: true, therapist: result.rows[0] });
  } catch (error) {
    logError('Admin: failed to verify therapist identity', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: 'Failed to verify identity' });
  }
});

// DELETE /api/admin/therapists/:id — permanently remove a therapist profile.
// Their consultations cascade-delete (FK ON DELETE CASCADE from migration 041);
// the linked user account is left intact. Use suspend for a reversible hide.
adminRouter.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM therapists WHERE id = $1 RETURNING id, display_name`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Therapist not found' });
    }
    logWarn('Admin deleted therapist', { id: req.params.id, displayName: result.rows[0].display_name });
    res.json({ success: true, message: 'Therapist deleted', id: result.rows[0].id });
  } catch (error) {
    logError('Admin: failed to delete therapist', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: 'Failed to delete therapist' });
  }
});

module.exports = { router, adminRouter, FOCUS_AREAS };
