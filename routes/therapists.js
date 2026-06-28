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
const ecpay = require('../lib/ecpay');
const newebpay = require('../lib/newebpay');
const qaPool = require('../lib/qaPool');
const { logInfo, logWarn, logError } = require('../lib/logger');

const router = express.Router();
const adminRouter = express.Router();

// Paid video session economics. The platform keeps PLATFORM_FEE_RATE.standard
// (20%) of each session, but only PLATFORM_FEE_RATE.intro (10%) for a new
// therapist's first INTRO_SESSION_LIMIT completed sessions.
const PLATFORM_FEE_RATE = { intro: 10, standard: 20 };
const INTRO_SESSION_LIMIT = 10;
const MEETING_PROVIDERS = ['zoom', 'meet', 'other'];

// External origin ECPay can reach for callbacks (mirrors routes/billing.js).
const appBaseUrl = () => (process.env.APP_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

// ECPay MerchantTradeNo: alphanumeric, <= 20 chars, unique (mirrors billing.js).
const genMerchantTradeNo = () => {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString('hex');
  return `TS${ts}${rand}`.slice(0, 20).toUpperCase();
};

// Compute the platform fee split for a therapist's next paid session. A session
// counts toward the intro window only once it is paid AND completed, so we count
// counts_toward_intro rows to decide the rate for the NEXT charge.
const computeFeeSplit = async (therapistId, price) => {
  const introUsed = await db.query(
    `SELECT COUNT(*)::int AS c FROM therapist_consultations
       WHERE therapist_id = $1 AND counts_toward_intro = true`,
    [therapistId]
  );
  const feeRate = introUsed.rows[0].c < INTRO_SESSION_LIMIT ? PLATFORM_FEE_RATE.intro : PLATFORM_FEE_RATE.standard;
  const platformFee = Math.floor((price * feeRate) / 100);
  const therapistNet = price - platformFee;
  return { feeRate, platformFee, therapistNet };
};

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

// Parse a JSONB column that may come back as a JS array (node-postgres parses
// jsonb) or, defensively, as a JSON string. Always returns an array.
const asJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const v = JSON.parse(value); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
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
  // Rich profile sections (048).
  introMessage: row.intro_message,
  approach: row.approach,
  about: row.about,
  certifications: row.certifications || [],
  currentPositions: row.current_positions || [],
  qualifications: row.qualifications || [],
  training: row.training || [],
  publications: asJsonArray(row.publications),
  articles: asJsonArray(row.articles),
  acceptingNewClients: row.accepting_new_clients !== false,
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

// Rich-profile list limits (positions / qualifications / training / certs).
const MAX_PROFILE_LIST_ITEMS = 40;
const MAX_PROFILE_LIST_ITEM_LEN = 300;
// Generic line-list: trim, drop empties, clamp each line + the list length.
const sanitizeTextList = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim().slice(0, MAX_PROFILE_LIST_ITEM_LEN) : ''))
    .filter(Boolean)
    .slice(0, MAX_PROFILE_LIST_ITEMS);
};
// Link list (publications/articles): array of { title, source|url }. Keeps only
// items with a non-empty title; clamps lengths; tolerates either key name.
const sanitizeLinkList = (value, urlKey) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const title = typeof item.title === 'string' ? item.title.trim().slice(0, MAX_PROFILE_LIST_ITEM_LEN) : '';
      if (!title) return null;
      const raw = item[urlKey] ?? item.url ?? item.source ?? '';
      const link = typeof raw === 'string' ? raw.trim().slice(0, 1000) : '';
      return { title, [urlKey]: link };
    })
    .filter(Boolean)
    .slice(0, MAX_PROFILE_LIST_ITEMS);
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

// Anonymise a reviewer's name for public display, like the reference site:
// 林少湲 → 林O湲, 高媜 → 高O, 李 → 李. Masks the middle so a real name isn't
// fully exposed on the public profile.
const maskName = (name) => {
  const n = (name || '').trim();
  if (n.length <= 1) return n || '匿名';
  if (n.length === 2) return `${n[0]}O`;
  return `${n[0]}O${n[n.length - 1]}`;
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
      tc.public_status, tc.public_title,
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
  // Rich profile (048)
  body('introMessage').optional({ nullable: true }).isString().isLength({ max: 8000 }),
  body('approach').optional({ nullable: true }).isString().isLength({ max: 8000 }),
  body('about').optional({ nullable: true }).isString().isLength({ max: 8000 }),
  body('certifications').optional().isArray(),
  body('currentPositions').optional().isArray(),
  body('qualifications').optional().isArray(),
  body('training').optional().isArray(),
  body('publications').optional().isArray(),
  body('articles').optional().isArray(),
  body('acceptingNewClients').optional().isBoolean(),
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

    // Rich profile sections (048).
    if (req.body.introMessage !== undefined) push('intro_message', (req.body.introMessage || '').trim() || null);
    if (req.body.approach !== undefined) push('approach', (req.body.approach || '').trim() || null);
    if (req.body.about !== undefined) push('about', (req.body.about || '').trim() || null);
    if (req.body.certifications !== undefined) push('certifications', sanitizeTextList(req.body.certifications));
    if (req.body.currentPositions !== undefined) push('current_positions', sanitizeTextList(req.body.currentPositions));
    if (req.body.qualifications !== undefined) push('qualifications', sanitizeTextList(req.body.qualifications));
    if (req.body.training !== undefined) push('training', sanitizeTextList(req.body.training));
    if (req.body.publications !== undefined) push('publications', JSON.stringify(sanitizeLinkList(req.body.publications, 'source')));
    if (req.body.articles !== undefined) push('articles', JSON.stringify(sanitizeLinkList(req.body.articles, 'url')));
    if (req.body.acceptingNewClients !== undefined) push('accepting_new_clients', Boolean(req.body.acceptingNewClients));

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
        tc.public_status, tc.public_title,
        tc.booking_type, tc.payment_status, tc.price_twd, tc.meeting_provider, tc.meeting_url,
        tc.therapist_id,
        t.display_name AS therapist_name, t.title AS therapist_title,
        t.rate_twd AS therapist_rate_twd, t.session_minutes AS therapist_session_minutes,
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
        therapistId: r.therapist_id,
        therapistName: r.therapist_name,
        therapistTitle: r.therapist_title,
        therapistRateTwd: r.therapist_rate_twd,
        therapistSessionMinutes: r.therapist_session_minutes,
        requesterName: r.requester_name,
        role: r.therapist_user_id && r.therapist_user_id === req.user.id ? 'therapist' : 'client',
        focusArea: r.focus_area,
        message: r.message,
        preferredTime: r.preferred_time,
        status: r.status,
        respondedAt: r.responded_at,
        responseNote: r.response_note,
        publicStatus: r.public_status,
        publicTitle: r.public_title,
        bookingType: r.booking_type,
        paymentStatus: r.payment_status,
        priceTwd: r.price_twd,
        meetingProvider: r.meeting_provider,
        // Only reveal the meeting link once paid (it's the therapist's room).
        meetingUrl: r.payment_status === 'paid' ? r.meeting_url : null,
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
      publicStatus: access.row.public_status,
      publicTitle: access.row.public_title,
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

    // In-app notification (NOT email) to every other participant. The first
    // booking already emailed both sides; ongoing chat stays in-app only.
    try {
      const r = access.row;
      const recipients = [...new Set(
        [r.therapist_user_id, r.requester_id, r.user1_id, r.user2_id]
          .filter((uid) => uid && uid !== req.user.id)
      )];
      const senderName = access.isTherapist ? (r.therapist_name || '諮商師') : (req.user.nickname || '對方');
      const snippet = req.body.body.trim().slice(0, 120);
      for (const uid of recipients) {
        await db.query(
          `INSERT INTO notifications (user_id, notification_type, title, content, related_user_id, priority)
           VALUES ($1, 'consultation_message', $2, $3, $4, 2)`,
          [uid, `${senderName} 在諮商室回覆了`, snippet, req.user.id]
        );
      }
    } catch (notifyErr) {
      logWarn('Consultation message notification failed', { id: req.params.id, err: notifyErr.message });
    }
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
  body('action').isIn(['accept', 'decline', 'complete', 'no_show']).withMessage('action 無效'),
  body('note').optional({ nullable: true }).isString().isLength({ max: 1000 }),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const access = await loadConsultationAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這個預約' });
    if (!access.isTherapist) return res.status(403).json({ success: false, message: '只有諮商師可以回覆預約' });

    const statusMap = { accept: 'accepted', decline: 'declined', complete: 'completed', no_show: 'no_show' };
    const status = statusMap[req.body.action];
    // A session counts toward the therapist's intro window only when it is both
    // paid AND completed — flip the flag here (guarded by payment_status in SQL).
    const willComplete = req.body.action === 'complete';
    const result = await db.query(
      `UPDATE therapist_consultations
          SET status = $1, response_note = $2, responded_at = NOW(),
              counts_toward_intro = CASE WHEN $4 AND payment_status = 'paid' THEN true ELSE counts_toward_intro END
        WHERE id = $3 RETURNING id, status, counts_toward_intro`,
      [status, req.body.note || null, req.params.id, willComplete]
    );
    res.json({ success: true, consultation: result.rows[0] });
  } catch (error) {
    logError('Failed to respond to consultation', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '回覆預約失敗' });
  }
});

// --- 公開問答 (Public Q&A) publish handshake ----------------------------
//
// A free consultation chat can be published, read-only and anonymised, so other
// users can learn from it. Publishing needs BOTH parties to consent: one side
// proposes (publish-request), the OTHER role approves (publish-approve), and
// either side can pull it back (publish-withdraw). The asker is never named in
// the public payload — anonymisation is enforced in the browse routes below.

const MAX_PUBLIC_TITLE_LEN = 200;

// POST /api/therapists/consultations/:id/publish-request — propose publishing.
// Either participant may propose; records which role asked so the other role's
// approval is what flips it public.
router.post('/consultations/:id/publish-request', authenticateToken, [
  body('title').isString().trim().isLength({ min: 1, max: MAX_PUBLIC_TITLE_LEN })
    .withMessage(`標題長度需為 1-${MAX_PUBLIC_TITLE_LEN} 字`),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const access = await loadConsultationAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這個諮商室' });
    if (!access.isParticipant) return res.status(403).json({ success: false, message: '你沒有權限公開這個對話' });

    // Only propose from a private/withdrawn room. Re-proposing a pending request
    // or an already-published room is a no-op the UI should already prevent.
    if (!['private', 'withdrawn'].includes(access.row.public_status)) {
      return res.status(409).json({
        success: false,
        error_code: 'PUBLISH_ALREADY_PENDING',
        message: access.row.public_status === 'published'
          ? '這個對話已經公開了'
          : '已經有一方提議公開，等待另一方同意中',
      });
    }

    const nextStatus = access.isTherapist ? 'therapist_requested' : 'client_requested';
    const result = await db.query(`
      UPDATE therapist_consultations
         SET public_status = $1, public_requested_by = $2, public_title = $3,
             public_approved_by = NULL, published_at = NULL
       WHERE id = $4
       RETURNING id, public_status, public_title
    `, [nextStatus, req.user.id, req.body.title.trim(), req.params.id]);

    logInfo('Public Q&A publish requested', {
      consultationId: req.params.id, userId: req.user.id, role: access.role,
    });
    res.json({
      success: true,
      message: access.isTherapist
        ? '已提議公開，等待個案同意。同意後會匿名顯示在公開問答。'
        : '已提議公開，等待諮商師同意。同意後會匿名顯示在公開問答。',
      publicStatus: result.rows[0].public_status,
      publicTitle: result.rows[0].public_title,
    });
  } catch (error) {
    logError('Failed to request publish', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '提議公開失敗，請稍後再試' });
  }
});

// POST /api/therapists/consultations/:id/publish-approve — the OTHER party
// consents, flipping the room to published.
router.post('/consultations/:id/publish-approve', authenticateToken, async (req, res) => {
  try {
    const access = await loadConsultationAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這個諮商室' });
    if (!access.isParticipant) return res.status(403).json({ success: false, message: '你沒有權限公開這個對話' });

    const status = access.row.public_status;
    if (!['client_requested', 'therapist_requested'].includes(status)) {
      return res.status(409).json({
        success: false,
        error_code: 'PUBLISH_NOT_PENDING',
        message: status === 'published' ? '這個對話已經公開了' : '目前沒有待同意的公開提議',
      });
    }
    // Consent must come from the opposite role to whoever proposed it.
    const approverMustBeTherapist = status === 'client_requested';
    if (approverMustBeTherapist !== access.isTherapist) {
      return res.status(403).json({
        success: false,
        error_code: 'PUBLISH_NEEDS_OTHER_PARTY',
        message: approverMustBeTherapist
          ? '需要由諮商師同意才能公開'
          : '需要由個案同意才能公開',
      });
    }

    const result = await db.query(`
      UPDATE therapist_consultations
         SET public_status = 'published', public_approved_by = $1, published_at = NOW()
       WHERE id = $2
       RETURNING id, public_status, published_at
    `, [req.user.id, req.params.id]);

    logInfo('Public Q&A published', { consultationId: req.params.id, userId: req.user.id });
    res.json({
      success: true,
      message: '對話已匿名公開為公開問答，謝謝你願意幫助其他人。',
      publicStatus: result.rows[0].public_status,
      publishedAt: result.rows[0].published_at,
    });
  } catch (error) {
    logError('Failed to approve publish', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '同意公開失敗，請稍後再試' });
  }
});

// POST /api/therapists/consultations/:id/publish-withdraw — either party pulls a
// pending proposal or a published thread back to private.
router.post('/consultations/:id/publish-withdraw', authenticateToken, async (req, res) => {
  try {
    const access = await loadConsultationAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這個諮商室' });
    if (!access.isParticipant) return res.status(403).json({ success: false, message: '你沒有權限變更這個對話' });

    if (access.row.public_status === 'private') {
      return res.json({ success: true, message: '這個對話本來就是私密的', publicStatus: 'private' });
    }
    const result = await db.query(`
      UPDATE therapist_consultations
         SET public_status = 'withdrawn', published_at = NULL
       WHERE id = $1
       RETURNING id, public_status
    `, [req.params.id]);

    logInfo('Public Q&A withdrawn', { consultationId: req.params.id, userId: req.user.id });
    res.json({ success: true, message: '已取消公開，這個對話不再顯示於公開問答。', publicStatus: result.rows[0].public_status });
  } catch (error) {
    logError('Failed to withdraw publish', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '取消公開失敗，請稍後再試' });
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

// --- 公開問答 (Public Q&A) read-only browse -----------------------------
//
// Defined before /:id so "qa" isn't captured as a therapist id. These serve the
// published consultations to everyone (optionalAuth). The asker is ALWAYS
// anonymised here ("匿名個案") and their sender_id/name/email are never sent; the
// therapist is shown because the thread showcases their work.

const PUBLIC_QA_PAGE_SIZE = 20;
const QA_PREVIEW_LEN = 140;

// GET /api/therapists/qa?focus=couple&page=1 — list published threads.
router.get('/qa', optionalAuth, [
  queryValidator('focus').optional().isIn(FOCUS_AREAS).withMessage('focus 無效'),
  queryValidator('page').optional().isInt({ min: 1 }).withMessage('page 無效'),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * PUBLIC_QA_PAGE_SIZE;
    const fetchCap = offset + PUBLIC_QA_PAGE_SIZE + 1; // enough to paginate the merged set
    const preview = (s) =>
      s ? s.slice(0, QA_PREVIEW_LEN) + (s.length > QA_PREVIEW_LEN ? '…' : '') : '';

    // 1) Published therapist consultations (the asker is anonymised, therapist shown).
    const consultParams = [];
    let consultWhere = `tc.public_status = 'published'`;
    if (req.query.focus) {
      consultParams.push(req.query.focus);
      consultWhere += ` AND tc.focus_area = $${consultParams.length}`;
    }
    consultParams.push(fetchCap);
    const consultations = await db.query(`
      SELECT tc.id, tc.public_title, tc.focus_area, tc.published_at,
             t.id AS therapist_id, t.display_name AS therapist_name,
             t.title AS therapist_title, t.photo_url,
             (SELECT COUNT(*) FROM consultation_messages cm WHERE cm.consultation_id = tc.id) AS message_count,
             (SELECT COUNT(*) FROM consultation_public_votes v WHERE v.consultation_id = tc.id) AS helpful_count,
             (SELECT cm.body FROM consultation_messages cm
               WHERE cm.consultation_id = tc.id ORDER BY cm.created_at ASC LIMIT 1) AS first_message
        FROM therapist_consultations tc
        JOIN therapists t ON t.id = tc.therapist_id
       WHERE ${consultWhere}
       ORDER BY tc.published_at DESC
       LIMIT $${consultParams.length}
    `, consultParams);

    let merged = consultations.rows.map((r) => ({
      id: r.id,
      source: 'consultation',
      title: r.public_title,
      focusArea: r.focus_area,
      publishedAt: r.published_at,
      therapist: {
        id: r.therapist_id,
        displayName: r.therapist_name,
        title: r.therapist_title,
        photoUrl: r.photo_url,
      },
      preview: preview(r.first_message),
      messageCount: Number(r.message_count) || 0,
      helpfulCount: Number(r.helpful_count) || 0,
    }));

    // 2) Couple-shared conflict events + wall threads (no focus area, so they only
    // appear in the unfiltered "全部" view). Both parties are anonymised.
    if (!req.query.focus) {
      const [events, walls] = await Promise.all([
        db.query(`
          SELECT e.id, e.public_title, e.published_at, e.summary,
                 (SELECT COUNT(*) FROM event_messages m WHERE m.event_id = e.id) AS message_count
            FROM events e
           WHERE e.public_status = 'published'
           ORDER BY e.published_at DESC
           LIMIT $1`, [fetchCap]),
        db.query(`
          SELECT p.id, p.public_title, p.published_at, p.content,
                 (SELECT COUNT(*) FROM wall_post_replies r WHERE r.post_id = p.id) AS reply_count
            FROM wall_posts p
           WHERE p.public_status = 'published'
           ORDER BY p.published_at DESC
           LIMIT $1`, [fetchCap]),
      ]);
      merged = merged.concat(
        events.rows.map((r) => ({
          id: r.id,
          source: 'event',
          title: r.public_title,
          focusArea: null,
          publishedAt: r.published_at,
          therapist: null,
          preview: preview(r.summary),
          messageCount: Number(r.message_count) || 0,
          helpfulCount: 0,
        })),
        walls.rows.map((r) => ({
          id: r.id,
          source: 'wall',
          title: r.public_title,
          focusArea: null,
          publishedAt: r.published_at,
          therapist: null,
          preview: preview(r.content),
          messageCount: Number(r.reply_count) + 1 || 1,
          helpfulCount: 0,
        }))
      );
    }

    // Merge-sort by published_at desc, then paginate the combined set.
    merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const pageRows = merged.slice(offset, offset + PUBLIC_QA_PAGE_SIZE);
    const hasMore = merged.length > offset + PUBLIC_QA_PAGE_SIZE;
    res.json({ success: true, page, hasMore, threads: pageRows });
  } catch (error) {
    logError('Failed to list public Q&A', { err: error.message });
    res.status(500).json({ success: false, message: '無法取得公開問答列表' });
  }
});

// Anonymise a couple's two participants as 匿名 A / 匿名 B (stable per thread),
// with AI counselor messages always labelled "AI 諮商師".
function makeAnonLabeler() {
  const seen = new Map();
  const names = ['匿名 A', '匿名 B', '匿名 C'];
  return (senderId) => {
    if (!seen.has(senderId)) seen.set(senderId, names[seen.size] || '匿名');
    return seen.get(senderId);
  };
}

// GET /api/therapists/qa/:id?source=event|wall — published couple thread,
// read-only + fully anonymised (no names, no ids leaked).
router.get('/qa/:id', optionalAuth, async (req, res) => {
  try {
    const source = req.query.source;

    if (source === 'event') {
      const ev = await db.query(
        `SELECT e.id, e.public_title, e.published_at, e.summary, e.created_by,
                cu.nickname AS creator_nickname, cu.public_share_show_nickname AS creator_show
           FROM events e
           JOIN users cu ON cu.id = e.created_by
          WHERE e.id = $1 AND e.public_status = 'published'`,
        [req.params.id]
      );
      if (ev.rows.length === 0) {
        return res.status(404).json({ success: false, message: '找不到這則公開問答，或它已被取消公開' });
      }
      const e = ev.rows[0];
      const msgs = await db.query(
        `SELECT m.id, m.sender_id, m.content, m.is_ai, m.created_at,
                u.nickname, u.public_share_show_nickname AS show_nickname
           FROM event_messages m
           JOIN users u ON u.id = m.sender_id
          WHERE m.event_id = $1 ORDER BY m.created_at ASC`,
        [req.params.id]
      );
      const label = makeAnonLabeler();
      // Each participant shows their nickname only if they opted in; otherwise
      // 匿名 A / 匿名 B. AI counselor is always labelled.
      const nameFor = (senderId, show, nickname) =>
        show !== false && nickname ? nickname : label(senderId);
      const messages = [
        {
          id: `${e.id}-summary`, body: e.summary, createdAt: e.published_at, isTherapist: false, isAi: false,
          senderName: nameFor(e.created_by, e.creator_show, e.creator_nickname),
        },
        ...msgs.rows.map((m) => ({
          id: m.id,
          body: m.content,
          createdAt: m.created_at,
          isTherapist: false,
          isAi: m.is_ai === true,
          senderName: m.is_ai ? 'AI 諮商師' : nameFor(m.sender_id, m.show_nickname, m.nickname),
        })),
      ];
      return res.json({
        success: true,
        thread: {
          id: e.id, source: 'event', title: e.public_title, focusArea: null,
          publishedAt: e.published_at, helpfulCount: 0, hasVoted: false, therapist: null, messages,
        },
      });
    }

    if (source === 'wall') {
      const wp = await db.query(
        `SELECT p.id, p.public_title, p.published_at, p.content, p.author_id,
                au.nickname AS author_nickname, au.public_share_show_nickname AS author_show
           FROM wall_posts p
           JOIN users au ON au.id = p.author_id
          WHERE p.id = $1 AND p.public_status = 'published'`,
        [req.params.id]
      );
      if (wp.rows.length === 0) {
        return res.status(404).json({ success: false, message: '找不到這則公開問答，或它已被取消公開' });
      }
      const p = wp.rows[0];
      const replies = await db.query(
        `SELECT r.id, r.author_id, r.content, r.is_ai, r.created_at,
                u.nickname, u.public_share_show_nickname AS show_nickname
           FROM wall_post_replies r
           JOIN users u ON u.id = r.author_id
          WHERE r.post_id = $1 ORDER BY r.created_at ASC`,
        [req.params.id]
      );
      const label = makeAnonLabeler();
      const nameFor = (senderId, show, nickname) =>
        show !== false && nickname ? nickname : label(senderId);
      const messages = [
        {
          id: `${p.id}-post`, body: p.content, createdAt: p.published_at, isTherapist: false, isAi: false,
          senderName: nameFor(p.author_id, p.author_show, p.author_nickname),
        },
        ...replies.rows.map((r) => ({
          id: r.id,
          body: r.content,
          createdAt: r.created_at,
          isTherapist: false,
          isAi: r.is_ai === true,
          senderName: r.is_ai ? 'AI 諮商師' : nameFor(r.author_id, r.show_nickname, r.nickname),
        })),
      ];
      return res.json({
        success: true,
        thread: {
          id: p.id, source: 'wall', title: p.public_title, focusArea: null,
          publishedAt: p.published_at, helpfulCount: 0, hasVoted: false, therapist: null, messages,
        },
      });
    }

    const meta = await db.query(`
      SELECT tc.id, tc.public_title, tc.focus_area, tc.published_at,
             t.id AS therapist_id, t.user_id AS therapist_user_id,
             t.display_name AS therapist_name, t.title AS therapist_title, t.photo_url,
             (SELECT COUNT(*) FROM consultation_public_votes v WHERE v.consultation_id = tc.id) AS helpful_count
        FROM therapist_consultations tc
        JOIN therapists t ON t.id = tc.therapist_id
       WHERE tc.id = $1 AND tc.public_status = 'published'
    `, [req.params.id]);
    if (meta.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到這則公開問答，或它已被取消公開' });
    }
    const m = meta.rows[0];

    const msgs = await db.query(`
      SELECT cm.id, cm.sender_id, cm.body, cm.created_at
        FROM consultation_messages cm
       WHERE cm.consultation_id = $1
       ORDER BY cm.created_at ASC
    `, [req.params.id]);

    let hasVoted = false;
    if (req.user) {
      const v = await db.query(
        `SELECT 1 FROM consultation_public_votes WHERE consultation_id = $1 AND voter_id = $2`,
        [req.params.id, req.user.id]
      );
      hasVoted = v.rows.length > 0;
    }

    res.json({
      success: true,
      thread: {
        id: m.id,
        source: 'consultation',
        title: m.public_title,
        focusArea: m.focus_area,
        publishedAt: m.published_at,
        helpfulCount: Number(m.helpful_count) || 0,
        hasVoted,
        therapist: {
          id: m.therapist_id,
          displayName: m.therapist_name,
          title: m.therapist_title,
          photoUrl: m.photo_url,
        },
        // Anonymised transcript: never leak the asker's id/name. Only the
        // therapist is identified; everyone else is "匿名個案".
        messages: msgs.rows.map((msg) => {
          const isTherapist = Boolean(m.therapist_user_id) && msg.sender_id === m.therapist_user_id;
          return {
            id: msg.id,
            body: msg.body,
            createdAt: msg.created_at,
            isTherapist,
            senderName: isTherapist ? m.therapist_name : '匿名個案',
          };
        }),
      },
    });
  } catch (error) {
    logError('Failed to load public Q&A thread', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '無法載入公開問答' });
  }
});

// POST /api/therapists/qa/:id/vote — toggle a "helpful" vote on a published
// thread. Idempotent per (thread, user); returns the new state + count.
router.post('/qa/:id/vote', authenticateToken, async (req, res) => {
  try {
    const pub = await db.query(
      `SELECT 1 FROM therapist_consultations WHERE id = $1 AND public_status = 'published'`,
      [req.params.id]
    );
    if (pub.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到這則公開問答' });
    }
    const existing = await db.query(
      `SELECT 1 FROM consultation_public_votes WHERE consultation_id = $1 AND voter_id = $2`,
      [req.params.id, req.user.id]
    );
    let voted;
    if (existing.rows.length > 0) {
      await db.query(
        `DELETE FROM consultation_public_votes WHERE consultation_id = $1 AND voter_id = $2`,
        [req.params.id, req.user.id]
      );
      voted = false;
    } else {
      await db.query(
        `INSERT INTO consultation_public_votes (consultation_id, voter_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, req.user.id]
      );
      voted = true;
    }
    const count = await db.query(
      `SELECT COUNT(*)::int AS c FROM consultation_public_votes WHERE consultation_id = $1`,
      [req.params.id]
    );
    res.json({ success: true, voted, helpfulCount: count.rows[0].c });
  } catch (error) {
    logError('Failed to vote public Q&A', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '操作失敗，請稍後再試' });
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
      `SELECT id, contact_email, display_name FROM therapists WHERE id = $1 AND status = 'approved'`,
      [therapistId]
    );
    if (therapist.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到這位諮商師' });
    }
    const therapistRow = therapist.rows[0];

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

    // First-booking emails to BOTH sides. Fire-and-forget — the booking already
    // succeeded. Subsequent chat in the room uses in-app notifications, not email.
    emailService.sendConsultationRequestToTherapist({
      recipientEmail: therapistRow.contact_email,
      therapistName: therapistRow.display_name,
      clientName: req.user.nickname,
      focusArea: focusArea || null,
      message: message || null,
    }).catch((err) => logWarn('Consultation therapist email failed', { err: err.message }));

    emailService.sendConsultationBookingConfirmation({
      recipientEmail: contactEmail || req.user.email || null,
      clientName: req.user.nickname,
      therapistName: therapistRow.display_name,
    }).catch((err) => logWarn('Consultation confirmation email failed', { err: err.message }));
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

// --- Paid video sessions (視訊諮商) -------------------------------------

// POST /api/therapists/:id/book-video — book a paid 1:1 video session. Snapshots
// the therapist's price + duration; lands as pending/unpaid. sourceConsultationId
// links it back to the free chat it grew out of (the "預約視訊諮商" nudge).
router.post('/:id/book-video', authenticateToken, [
  body('message').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('preferredTime').optional({ nullable: true }).isISO8601().withMessage('時間格式錯誤'),
  body('sourceConsultationId').optional({ nullable: true }).isUUID().withMessage('來源無效'),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const therapistId = req.params.id;
    const therapist = await db.query(
      `SELECT id, rate_twd, session_minutes, accepting_new_clients, contact_email, display_name FROM therapists WHERE id = $1 AND status = 'approved'`,
      [therapistId]
    );
    if (therapist.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到這位諮商師' });
    }
    const t = therapist.rows[0];
    if (t.accepting_new_clients === false) {
      return res.status(409).json({ success: false, error_code: 'NOT_ACCEPTING', message: '這位諮商師目前暫不開放新案預約' });
    }

    const couple = await db.query(
      `SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1 LIMIT 1`,
      [req.user.id]
    );
    const coupleId = couple.rows[0] ? couple.rows[0].id : null;

    const result = await db.query(`
      INSERT INTO therapist_consultations
        (therapist_id, requester_id, couple_id, message, preferred_time,
         booking_type, source_consultation_id, duration_minutes, price_twd, payment_status)
      VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8,'unpaid')
      RETURNING id, status, payment_status, created_at
    `, [
      therapistId, req.user.id, coupleId, req.body.message || null,
      req.body.preferredTime || null, req.body.sourceConsultationId || null,
      t.session_minutes, t.rate_twd,
    ]);

    logInfo('Video session booked', { userId: req.user.id, therapistId, consultationId: result.rows[0].id });

    // First-booking emails to both sides (fire-and-forget). Ongoing chat uses
    // in-app notifications, not email.
    emailService.sendConsultationRequestToTherapist({
      recipientEmail: t.contact_email,
      therapistName: t.display_name,
      clientName: req.user.nickname,
      focusArea: null,
      message: req.body.message || null,
    }).catch((err) => logWarn('Video booking therapist email failed', { err: err.message }));

    emailService.sendConsultationBookingConfirmation({
      recipientEmail: req.user.email || null,
      clientName: req.user.nickname,
      therapistName: t.display_name,
    }).catch((err) => logWarn('Video booking confirmation email failed', { err: err.message }));
    res.status(201).json({
      success: true,
      message: '已建立預約，請完成付款以確認時段。',
      consultation: { id: result.rows[0].id, status: result.rows[0].status, paymentStatus: result.rows[0].payment_status, priceTwd: t.rate_twd },
    });
  } catch (error) {
    logError('Failed to book video session', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '預約失敗，請稍後再試' });
  }
});

// POST /api/therapists/consultations/:id/meeting-link — therapist pastes the
// third-party video link. Allowed once the booking is accepted.
router.post('/consultations/:id/meeting-link', authenticateToken, [
  body('provider').isIn(MEETING_PROVIDERS).withMessage('provider 無效'),
  body('url').isString().trim().isURL({ require_protocol: true }).withMessage('請貼上有效的會議連結'),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const access = await loadConsultationAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這個預約' });
    if (!access.isTherapist) return res.status(403).json({ success: false, message: '只有諮商師可以設定會議連結' });
    if (access.row.status !== 'accepted') {
      return res.status(409).json({ success: false, error_code: 'NOT_ACCEPTED', message: '請先接受預約，再設定會議連結' });
    }
    const result = await db.query(`
      UPDATE therapist_consultations
         SET meeting_provider = $1, meeting_url = $2, meeting_set_at = NOW()
       WHERE id = $3 RETURNING id, meeting_provider, meeting_url
    `, [req.body.provider, req.body.url.trim(), req.params.id]);
    logInfo('Meeting link set', { consultationId: req.params.id, userId: req.user.id });
    res.json({ success: true, message: '會議連結已提供給對方。', meetingProvider: result.rows[0].meeting_provider, meetingUrl: result.rows[0].meeting_url });
  } catch (error) {
    logError('Failed to set meeting link', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '設定會議連結失敗，請稍後再試' });
  }
});

// POST /api/therapists/consultations/:id/pay — start ECPay checkout for a
// scheduled session. Computes + snapshots the fee split, creates a pending
// order, and returns the form params the frontend auto-submits.
router.post('/consultations/:id/pay', authenticateToken, async (req, res) => {
  try {
    const provider = req.body && req.body.provider === 'newebpay' ? 'newebpay' : 'ecpay';
    if (provider === 'newebpay' && !newebpay.isConfigured()) {
      return res.status(503).json({
        success: false,
        error_code: 'NEWEBPAY_UNAVAILABLE',
        message: '藍新金流暫時無法使用，請改用綠界 ECPay 付款',
      });
    }

    const access = await loadConsultationAccess(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ success: false, message: '找不到這個預約' });
    if (!access.isParticipant || access.isTherapist) {
      return res.status(403).json({ success: false, message: '只有預約方可以付款' });
    }

    const row = await db.query(
      `SELECT tc.id, tc.therapist_id, tc.booking_type, tc.price_twd, tc.payment_status,
              t.display_name AS therapist_name
         FROM therapist_consultations tc JOIN therapists t ON t.id = tc.therapist_id
        WHERE tc.id = $1`,
      [req.params.id]
    );
    const c = row.rows[0];
    if (c.booking_type !== 'scheduled') {
      return res.status(400).json({ success: false, error_code: 'NOT_SCHEDULED', message: '這不是付費視訊預約' });
    }
    if (c.payment_status === 'paid') {
      return res.status(409).json({ success: false, error_code: 'ALREADY_PAID', message: '這個預約已經付款了' });
    }
    const price = Number(c.price_twd) || 0;
    if (price <= 0) {
      return res.status(400).json({ success: false, error_code: 'INVALID_PRICE', message: '預約金額異常，請重新預約' });
    }

    const { feeRate, platformFee, therapistNet } = await computeFeeSplit(c.therapist_id, price);
    const merchantTradeNo = genMerchantTradeNo();

    await db.transaction(async (client) => {
      await client.query(`
        INSERT INTO session_payment_orders
          (consultation_id, payer_id, therapist_id, merchant_trade_no, amount,
           fee_rate, platform_fee, therapist_net, status, provider)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)
      `, [c.id, req.user.id, c.therapist_id, merchantTradeNo, price, feeRate, platformFee, therapistNet, provider]);
      await client.query(`
        UPDATE therapist_consultations
           SET payment_status = 'pending', fee_rate = $2, platform_fee_twd = $3, therapist_net_twd = $4
         WHERE id = $1
      `, [c.id, feeRate, platformFee, therapistNet]);
    });

    const base = appBaseUrl();
    const itemName = `視訊諮商 — ${c.therapist_name}`.slice(0, 200);
    const { actionUrl, params } =
      provider === 'newebpay'
        ? newebpay.buildCheckoutParams({
            merchantTradeNo,
            amount: price,
            itemName,
            email: req.user.email || '',
            returnUrl: `${base}/api/therapists/sessions/newebpay/callback`,
            orderResultUrl: `${base}/api/therapists/sessions/newebpay/return`,
            clientBackUrl: `${base}/booking/result`,
          })
        : ecpay.buildCheckoutParams({
            merchantTradeNo,
            amount: price,
            itemName,
            tradeDesc: 'Twogether 視訊諮商',
            returnUrl: `${base}/api/therapists/sessions/ecpay/callback`,
            orderResultUrl: `${base}/api/therapists/sessions/ecpay/return`,
            clientBackUrl: `${base}/booking/result`,
          });

    logInfo('Session checkout created', { consultationId: c.id, userId: req.user.id, merchantTradeNo, amount: price, feeRate, provider });
    res.json({ success: true, action_url: actionUrl, params });
  } catch (error) {
    logError('Failed to start session payment', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '無法建立付款，請稍後再試' });
  }
});

// Mark a session order paid + snapshot the fee split onto the consultation,
// atomically. Shared by both gateway callbacks once they've verified the
// signature, matched the order, confirmed it isn't already paid, and confirmed
// the amount. gatewayTradeNo = the gateway's own trade id.
async function markSessionPaid(order, { gatewayTradeNo, paymentMethod, rawPayload }) {
  await db.transaction(async (client) => {
    await client.query(`
      UPDATE session_payment_orders
         SET status = 'paid', paid_at = NOW(), ecpay_trade_no = $2, payment_method = $3, raw_callback = $4
       WHERE id = $1
    `, [order.id, gatewayTradeNo || null, paymentMethod || null, rawPayload]);
    await client.query(`
      UPDATE therapist_consultations
         SET payment_status = 'paid', paid_at = NOW(),
             price_twd = $2, fee_rate = $3, platform_fee_twd = $4, therapist_net_twd = $5
       WHERE id = $1
    `, [order.consultation_id, order.amount, order.fee_rate, order.platform_fee, order.therapist_net]);
  });
  logInfo('session.callback.paid', {
    merchantTradeNo: order.merchant_trade_no,
    consultationId: order.consultation_id,
    therapistNet: order.therapist_net,
    provider: order.provider,
  });
}

async function markSessionFailed(order, rawPayload) {
  await db.transaction(async (client) => {
    await client.query(`UPDATE session_payment_orders SET status = 'failed', raw_callback = $2 WHERE id = $1`, [order.id, rawPayload]);
    await client.query(`UPDATE therapist_consultations SET payment_status = 'failed' WHERE id = $1`, [order.consultation_id]);
  });
}

// POST /api/therapists/sessions/ecpay/callback — ECPay server-to-server callback
// (PUBLIC, no JWT). Authoritative paid mark + fee-split record. Idempotent.
router.post('/sessions/ecpay/callback', async (req, res) => {
  const payload = req.body || {};
  try {
    if (!ecpay.verifyCallback(payload)) {
      logWarn('session.callback.bad_mac', { merchantTradeNo: payload.MerchantTradeNo });
      return res.status(400).send('0|CheckMacValue Error');
    }
    const merchantTradeNo = payload.MerchantTradeNo;
    const rtnCode = String(payload.RtnCode);

    const orderRes = await db.query(`SELECT * FROM session_payment_orders WHERE merchant_trade_no = $1`, [merchantTradeNo]);
    const order = orderRes.rows[0];
    if (!order) {
      logWarn('session.callback.unknown_order', { merchantTradeNo });
      return res.send('1|OK');
    }
    if (order.status === 'paid') return res.send('1|OK'); // idempotent

    if (Number(payload.TradeAmt) !== Number(order.amount)) {
      logWarn('session.callback.amount_mismatch', { merchantTradeNo, expected: order.amount, got: payload.TradeAmt });
      return res.status(400).send('0|Amount Mismatch');
    }

    if (rtnCode !== '1') {
      await markSessionFailed(order, payload);
      logInfo('session.callback.failed', { merchantTradeNo, rtnCode, msg: payload.RtnMsg });
      return res.send('1|OK');
    }

    await markSessionPaid(order, {
      gatewayTradeNo: payload.TradeNo,
      paymentMethod: payload.PaymentType,
      rawPayload: payload,
    });
    res.send('1|OK');
  } catch (error) {
    logError('Session callback failed', { err: error.message });
    res.status(500).send('0|Error');
  }
});

// POST /api/therapists/sessions/ecpay/return — browser POST-back (PUBLIC). The
// grant already happened server-side; just 302 to the SPA result route.
router.post('/sessions/ecpay/return', (req, res) => {
  const ok = String(req.body?.RtnCode) === '1';
  res.redirect(302, `/booking/result?status=${ok ? 'success' : 'failed'}`);
});

// POST /api/therapists/sessions/newebpay/callback — NewebPay NotifyURL (PUBLIC).
// Authoritative paid mark, mirroring the ECPay session callback. Idempotent.
router.post('/sessions/newebpay/callback', async (req, res) => {
  const payload = req.body || {};
  try {
    if (!newebpay.verifyCallback(payload)) {
      logWarn('session.callback.bad_mac', { provider: 'newebpay' });
      return res.status(400).send('0|TradeSha Error');
    }
    const parsed = newebpay.parseCallback(payload);
    if (!parsed || !parsed.merchantOrderNo) {
      logWarn('session.callback.unparsable', { provider: 'newebpay' });
      return res.status(400).send('0|Parse Error');
    }
    const merchantTradeNo = parsed.merchantOrderNo;

    const orderRes = await db.query(`SELECT * FROM session_payment_orders WHERE merchant_trade_no = $1`, [merchantTradeNo]);
    const order = orderRes.rows[0];
    if (!order) {
      logWarn('session.callback.unknown_order', { merchantTradeNo, provider: 'newebpay' });
      return res.send('1|OK');
    }
    if (order.status === 'paid') return res.send('1|OK'); // idempotent

    if (Number(parsed.amount) !== Number(order.amount)) {
      logWarn('session.callback.amount_mismatch', { merchantTradeNo, expected: order.amount, got: parsed.amount, provider: 'newebpay' });
      return res.status(400).send('0|Amount Mismatch');
    }

    if (!parsed.success) {
      await markSessionFailed(order, parsed.raw);
      logInfo('session.callback.failed', { merchantTradeNo, status: parsed.status, provider: 'newebpay' });
      return res.send('1|OK');
    }

    await markSessionPaid(order, {
      gatewayTradeNo: parsed.tradeNo,
      paymentMethod: parsed.paymentType,
      rawPayload: parsed.raw,
    });
    res.send('1|OK');
  } catch (error) {
    logError('Session callback failed', { err: error.message, provider: 'newebpay' });
    res.status(500).send('0|Error');
  }
});

// POST /api/therapists/sessions/newebpay/return — browser POST-back (PUBLIC).
router.post('/sessions/newebpay/return', (req, res) => {
  const parsed = newebpay.parseCallback(req.body || {});
  const ok = parsed ? parsed.success : false;
  res.redirect(302, `/booking/result?status=${ok ? 'success' : 'failed'}`);
});

// GET /api/therapists/me/earnings — therapist's session earnings + intro status.
router.get('/me/earnings', authenticateToken, async (req, res) => {
  try {
    const t = await db.query(`SELECT id FROM therapists WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [req.user.id]);
    if (t.rows.length === 0) {
      return res.status(404).json({ success: false, error_code: 'NO_THERAPIST_PROFILE', message: '你還沒有諮商師檔案' });
    }
    const therapistId = t.rows[0].id;

    const introUsed = await db.query(
      `SELECT COUNT(*)::int AS c FROM therapist_consultations WHERE therapist_id = $1 AND counts_toward_intro = true`,
      [therapistId]
    );
    const introCount = introUsed.rows[0].c;
    const paid = await db.query(`
      SELECT tc.id, tc.price_twd, tc.fee_rate, tc.platform_fee_twd, tc.therapist_net_twd,
             tc.paid_at, tc.status, tc.scheduled_at, tc.preferred_time
        FROM therapist_consultations tc
       WHERE tc.therapist_id = $1 AND tc.payment_status = 'paid'
       ORDER BY tc.paid_at DESC NULLS LAST
    `, [therapistId]);
    const totalNet = paid.rows.reduce((sum, r) => sum + (Number(r.therapist_net_twd) || 0), 0);

    res.json({
      success: true,
      earnings: {
        introSessionsUsed: introCount,
        introSessionsRemaining: Math.max(0, INTRO_SESSION_LIMIT - introCount),
        currentFeeRate: introCount < INTRO_SESSION_LIMIT ? PLATFORM_FEE_RATE.intro : PLATFORM_FEE_RATE.standard,
        paidSessionCount: paid.rows.length,
        totalNetTwd: totalNet,
        sessions: paid.rows.map((r) => ({
          id: r.id,
          priceTwd: r.price_twd,
          feeRate: r.fee_rate,
          platformFeeTwd: r.platform_fee_twd,
          therapistNetTwd: r.therapist_net_twd,
          paidAt: r.paid_at,
          status: r.status,
        })),
      },
    });
  } catch (error) {
    logError('Failed to load earnings', { userId: req.user?.id, err: error.message });
    res.status(500).json({ success: false, message: '無法取得收入資料' });
  }
});

// --- Client reviews (客戶評價) ------------------------------------------

// GET /api/therapists/:id/reviews — public, approved reviews + summary. Also
// tells a logged-in user whether they're eligible to review / already have.
router.get('/:id/reviews', optionalAuth, async (req, res) => {
  try {
    const reviews = await db.query(`
      SELECT id, reviewer_display, rating, body, created_at
        FROM therapist_reviews
       WHERE therapist_id = $1 AND status = 'approved'
       ORDER BY created_at DESC
    `, [req.params.id]);

    const summary = await db.query(`
      SELECT COUNT(*)::int AS count,
             ROUND(AVG(rating)::numeric, 1) AS avg_rating
        FROM therapist_reviews
       WHERE therapist_id = $1 AND status = 'approved' AND rating IS NOT NULL
    `, [req.params.id]);

    // Eligibility: a logged-in user who has booked this therapist (themselves or
    // via their couple) and hasn't already reviewed may leave one.
    let canReview = false;
    let alreadyReviewed = false;
    if (req.user) {
      const booked = await db.query(`
        SELECT 1 FROM therapist_consultations tc
        LEFT JOIN couples c ON c.id = tc.couple_id
        WHERE tc.therapist_id = $1
          AND (tc.requester_id = $2 OR c.user1_id = $2 OR c.user2_id = $2)
        LIMIT 1
      `, [req.params.id, req.user.id]);
      const mine = await db.query(
        `SELECT status FROM therapist_reviews WHERE therapist_id = $1 AND author_id = $2`,
        [req.params.id, req.user.id]
      );
      alreadyReviewed = mine.rows.length > 0;
      canReview = booked.rows.length > 0 && !alreadyReviewed;
    }

    res.json({
      success: true,
      summary: {
        count: summary.rows[0].count || 0,
        avgRating: summary.rows[0].avg_rating !== null ? Number(summary.rows[0].avg_rating) : null,
      },
      canReview,
      alreadyReviewed,
      reviews: reviews.rows.map((r) => ({
        id: r.id,
        reviewerDisplay: r.reviewer_display,
        rating: r.rating,
        body: r.body,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    logError('Failed to load therapist reviews', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '無法取得評價' });
  }
});

// POST /api/therapists/:id/reviews — leave a review. Must have booked this
// therapist; one review per author. Lands as 'pending' for admin moderation.
router.post('/:id/reviews', authenticateToken, [
  body('body').isString().trim().isLength({ min: 1, max: 4000 }).withMessage('評價內容需為 1-4000 字'),
  body('rating').optional({ nullable: true }).isInt({ min: 1, max: 5 }).withMessage('評分需為 1-5'),
  body('displayName').optional({ nullable: true }).isString().isLength({ max: 80 }),
], async (req, res) => {
  if (!handleValidation(req, res)) return;
  try {
    const therapistId = req.params.id;
    const therapist = await db.query(`SELECT id, user_id FROM therapists WHERE id = $1`, [therapistId]);
    if (therapist.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到這位諮商師' });
    }
    if (therapist.rows[0].user_id === req.user.id) {
      return res.status(400).json({ success: false, error_code: 'SELF_REVIEW', message: '不能評價自己的檔案' });
    }

    const booked = await db.query(`
      SELECT 1 FROM therapist_consultations tc
      LEFT JOIN couples c ON c.id = tc.couple_id
      WHERE tc.therapist_id = $1
        AND (tc.requester_id = $2 OR c.user1_id = $2 OR c.user2_id = $2)
      LIMIT 1
    `, [therapistId, req.user.id]);
    if (booked.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error_code: 'REVIEW_REQUIRES_CONSULTATION',
        message: '與這位諮商師預約過後，才能留下評價',
      });
    }

    const dup = await db.query(
      `SELECT 1 FROM therapist_reviews WHERE therapist_id = $1 AND author_id = $2`,
      [therapistId, req.user.id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ success: false, error_code: 'ALREADY_REVIEWED', message: '你已經評價過這位諮商師了' });
    }

    // Use a provided display name, else mask the user's nickname.
    let display = (req.body.displayName || '').trim();
    if (!display) {
      const u = await db.query(`SELECT nickname FROM users WHERE id = $1`, [req.user.id]);
      display = maskName(u.rows[0] && u.rows[0].nickname);
    }

    await db.query(`
      INSERT INTO therapist_reviews (therapist_id, author_id, reviewer_display, rating, body, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
    `, [therapistId, req.user.id, display.slice(0, 80), req.body.rating || null, req.body.body.trim()]);

    logInfo('Therapist review submitted', { therapistId, userId: req.user.id });
    res.status(201).json({ success: true, message: '感謝你的評價！我們會在審核後公開顯示。' });
  } catch (error) {
    logError('Failed to submit therapist review', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '送出評價失敗，請稍後再試' });
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

// GET /api/admin/therapists/reviews?status=pending — review moderation queue.
adminRouter.get('/reviews', async (req, res) => {
  try {
    const status = ['pending', 'approved', 'hidden'].includes(req.query.status) ? req.query.status : 'pending';
    const result = await db.query(`
      SELECT r.id, r.therapist_id, r.reviewer_display, r.rating, r.body, r.status, r.created_at,
             t.display_name AS therapist_name
        FROM therapist_reviews r
        JOIN therapists t ON t.id = r.therapist_id
       WHERE r.status = $1
       ORDER BY r.created_at DESC
    `, [status]);
    res.json({ success: true, reviews: result.rows });
  } catch (error) {
    logError('Admin: failed to list reviews', { err: error.message });
    res.status(500).json({ success: false, message: 'Failed to list reviews' });
  }
});

// POST /api/admin/therapists/reviews/:id/moderate { action: 'approve'|'hide' }
adminRouter.post('/reviews/:id/moderate', express.json(), async (req, res) => {
  try {
    const action = req.body && req.body.action;
    const status = { approve: 'approved', hide: 'hidden' }[action];
    if (!status) {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'hide'" });
    }
    const result = await db.query(
      `UPDATE therapist_reviews SET status = $1 WHERE id = $2 RETURNING id, status`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    logInfo('Admin moderated review', { id: req.params.id, status });
    res.json({ success: true, review: result.rows[0] });
  } catch (error) {
    logError('Admin: failed to moderate review', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: 'Failed to moderate review' });
  }
});

// --- Admin: monthly Q&A revenue pool ------------------------------------
//
// The pool is paid out MANUALLY (ECPay only collects). These endpoints let an
// admin set a month's pool, compute each active therapist's share from that
// month's engagement, freeze it, and record manual payouts.

// Aggregate a month's engagement per therapist: free-chat messages they sent,
// threads they published, and helpful votes their published threads received.
// The [monthStart, monthStart + 1 month) window is computed in SQL from a
// 'YYYY-MM-01' string so server-timezone Date math can't shift the month.
const aggregateMonthlyEngagement = async (periodMonth) => {
  const result = await db.query(`
    WITH win AS (SELECT $1::date AS s, ($1::date + interval '1 month') AS e)
    SELECT t.id AS therapist_id,
      (SELECT COUNT(*) FROM consultation_messages cm
         JOIN therapist_consultations tc ON tc.id = cm.consultation_id, win
        WHERE tc.therapist_id = t.id AND cm.sender_id = t.user_id
          AND cm.created_at >= win.s AND cm.created_at < win.e) AS message_count,
      (SELECT COUNT(*) FROM therapist_consultations tc, win
        WHERE tc.therapist_id = t.id AND tc.public_status = 'published'
          AND tc.published_at >= win.s AND tc.published_at < win.e) AS published_count,
      (SELECT COUNT(*) FROM consultation_public_votes v
         JOIN therapist_consultations tc ON tc.id = v.consultation_id, win
        WHERE tc.therapist_id = t.id AND v.created_at >= win.s AND v.created_at < win.e) AS vote_count
    FROM therapists t
    WHERE t.status = 'approved' AND t.user_id IS NOT NULL
  `, [periodMonth]);
  return result.rows.map((r) => ({
    therapist_id: r.therapist_id,
    message_count: Number(r.message_count) || 0,
    published_count: Number(r.published_count) || 0,
    vote_count: Number(r.vote_count) || 0,
  }));
};

// POST /api/admin/therapists/qa/pools { periodMonth: 'YYYY-MM-01', poolTwd, splitStrategy }
adminRouter.post('/qa/pools', express.json(), async (req, res) => {
  try {
    const { periodMonth, poolTwd, splitStrategy } = req.body || {};
    if (!/^\d{4}-\d{2}-01$/.test(String(periodMonth || ''))) {
      return res.status(400).json({ success: false, message: "periodMonth must be 'YYYY-MM-01'" });
    }
    if (!Number.isInteger(poolTwd) || poolTwd < 0) {
      return res.status(400).json({ success: false, message: 'poolTwd must be a non-negative integer' });
    }
    const strategy = ['even', 'volume', 'engagement'].includes(splitStrategy) ? splitStrategy : 'even';
    const result = await db.query(`
      INSERT INTO qa_revenue_pools (period_month, pool_twd, split_strategy, status)
      VALUES ($1, $2, $3, 'draft')
      ON CONFLICT (period_month) DO UPDATE
        SET pool_twd = EXCLUDED.pool_twd, split_strategy = EXCLUDED.split_strategy
        WHERE qa_revenue_pools.status IN ('draft', 'computed')
      RETURNING *
    `, [periodMonth, poolTwd, strategy]);
    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, message: 'Pool already finalized for this month' });
    }
    logInfo('Admin created/updated QA pool', { periodMonth, poolTwd, strategy });
    res.json({ success: true, pool: result.rows[0] });
  } catch (error) {
    logError('Admin: failed to create QA pool', { err: error.message });
    res.status(500).json({ success: false, message: 'Failed to create pool' });
  }
});

// POST /api/admin/therapists/qa/pools/:id/compute — aggregate the month and
// (re)compute each therapist's share. Allowed while draft/computed.
adminRouter.post('/qa/pools/:id/compute', async (req, res) => {
  try {
    const poolRes = await db.query(`SELECT * FROM qa_revenue_pools WHERE id = $1`, [req.params.id]);
    const pool = poolRes.rows[0];
    if (!pool) return res.status(404).json({ success: false, message: 'Pool not found' });
    if (!['draft', 'computed'].includes(pool.status)) {
      return res.status(409).json({ success: false, message: 'Pool is finalized; cannot recompute' });
    }

    // Format the DATE back to 'YYYY-MM-01' from its own components (node-pg
    // parses DATE to a local-midnight Date; local components match what's stored).
    const pm = pool.period_month instanceof Date
      ? `${pool.period_month.getFullYear()}-${String(pool.period_month.getMonth() + 1).padStart(2, '0')}-01`
      : String(pool.period_month).slice(0, 10);

    const stats = await aggregateMonthlyEngagement(pm);
    const shares = qaPool.computeShares(pool.split_strategy, stats, pool.pool_twd);

    await db.transaction(async (client) => {
      // Recompute is idempotent: clear prior shares for this pool, reinsert.
      await client.query(`DELETE FROM qa_revenue_shares WHERE pool_id = $1`, [req.params.id]);
      for (const s of shares) {
        await client.query(`
          INSERT INTO qa_revenue_shares
            (pool_id, therapist_id, message_count, published_count, vote_count, weight, share_twd)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [req.params.id, s.therapist_id, s.message_count, s.published_count, s.vote_count, s.weight, s.share_twd]);
      }
      await client.query(`UPDATE qa_revenue_pools SET status = 'computed', computed_at = NOW() WHERE id = $1`, [req.params.id]);
    });

    logInfo('Admin computed QA pool shares', { poolId: req.params.id, recipients: shares.length });
    res.json({ success: true, recipients: shares.length, totalAllocated: shares.reduce((a, s) => a + s.share_twd, 0) });
  } catch (error) {
    logError('Admin: failed to compute QA pool', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: 'Failed to compute pool' });
  }
});

// POST /api/admin/therapists/qa/pools/:id/finalize — freeze the computed shares.
adminRouter.post('/qa/pools/:id/finalize', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE qa_revenue_pools SET status = 'finalized', finalized_at = NOW()
        WHERE id = $1 AND status = 'computed' RETURNING id, status`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, message: 'Pool must be computed before finalizing' });
    }
    logInfo('Admin finalized QA pool', { poolId: req.params.id });
    res.json({ success: true, pool: result.rows[0] });
  } catch (error) {
    logError('Admin: failed to finalize QA pool', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: 'Failed to finalize pool' });
  }
});

// POST /api/admin/therapists/qa/shares/:id/mark-paid { note } — record a manual
// payout to a therapist (no automated transfer; ECPay only collects).
adminRouter.post('/qa/shares/:id/mark-paid', express.json(), async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE qa_revenue_shares SET payout_status = 'paid', paid_at = NOW(), payout_note = $2
        WHERE id = $1 RETURNING id, payout_status`,
      [req.params.id, (req.body && req.body.note) || null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Share not found' });
    }
    // If all shares for the pool are paid, mark the pool paid_out.
    await db.query(`
      UPDATE qa_revenue_pools p SET status = 'paid_out'
       WHERE p.id = (SELECT pool_id FROM qa_revenue_shares WHERE id = $1)
         AND p.status = 'finalized'
         AND NOT EXISTS (SELECT 1 FROM qa_revenue_shares s WHERE s.pool_id = p.id AND s.payout_status <> 'paid')
    `, [req.params.id]);
    logInfo('Admin marked QA share paid', { shareId: req.params.id });
    res.json({ success: true, share: result.rows[0] });
  } catch (error) {
    logError('Admin: failed to mark share paid', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: 'Failed to mark paid' });
  }
});

// GET /api/admin/therapists/qa/pools — list pools (newest first).
adminRouter.get('/qa/pools', async (req, res) => {
  try {
    // period_month via to_char so server-timezone Date serialization (node-pg
    // parses DATE to a local-midnight Date) can't shift the displayed month.
    const result = await db.query(`
      SELECT p.id, to_char(p.period_month, 'YYYY-MM-DD') AS period_month,
        p.pool_twd, p.split_strategy, p.status, p.computed_at, p.finalized_at, p.created_at,
        (SELECT COUNT(*) FROM qa_revenue_shares s WHERE s.pool_id = p.id) AS recipient_count,
        (SELECT COALESCE(SUM(share_twd),0) FROM qa_revenue_shares s WHERE s.pool_id = p.id) AS allocated_twd
      FROM qa_revenue_pools p ORDER BY p.period_month DESC
    `);
    res.json({ success: true, pools: result.rows });
  } catch (error) {
    logError('Admin: failed to list QA pools', { err: error.message });
    res.status(500).json({ success: false, message: 'Failed to list pools' });
  }
});

// GET /api/admin/therapists/qa/pools/:id — pool + per-therapist shares.
adminRouter.get('/qa/pools/:id', async (req, res) => {
  try {
    const pool = await db.query(`
      SELECT id, to_char(period_month, 'YYYY-MM-DD') AS period_month,
        pool_twd, split_strategy, status, computed_at, finalized_at, created_at
      FROM qa_revenue_pools WHERE id = $1
    `, [req.params.id]);
    if (pool.rows.length === 0) return res.status(404).json({ success: false, message: 'Pool not found' });
    const shares = await db.query(`
      SELECT s.*, t.display_name AS therapist_name
        FROM qa_revenue_shares s JOIN therapists t ON t.id = s.therapist_id
       WHERE s.pool_id = $1 ORDER BY s.share_twd DESC
    `, [req.params.id]);
    res.json({ success: true, pool: pool.rows[0], shares: shares.rows });
  } catch (error) {
    logError('Admin: failed to get QA pool', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: 'Failed to get pool' });
  }
});

module.exports = { router, adminRouter, FOCUS_AREAS };
