const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { getCoupleTier, getLimit, checkLimit } = require('../lib/entitlements');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const { logError, logInfo, logWarn } = require('../lib/logger');
const emailService = require('../services/emailService');
const llmService = require('../services/llmService');
const { notifyPartnerAction } = require('../services/notificationService');
const {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  uploadMedia,
  checkMediaSizes: checkMediaSizesShared,
  normalizeUrlList,
  createMediaMulter,
  wrapMulterErrors,
} = require('../lib/media-upload');

const router = express.Router();

// Max photos a single custom script may carry (cover + extras).
const MAX_SCRIPT_PHOTOS = 30;

// Accept both the legacy single `thumbnail` field and the new `photos[]` field
// so old clients keep working while the modal sends a multi-photo series.
const scriptPhotoUploadRaw = createMediaMulter({ maxFiles: MAX_SCRIPT_PHOTOS + 1 }).fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'photos', maxCount: MAX_SCRIPT_PHOTOS },
]);

// Wrap the multer middleware so its errors (oversize file, rejected type)
// become specific, actionable JSON with an error_code instead of a generic 500.
const scriptPhotoUpload = wrapMulterErrors(scriptPhotoUploadRaw, {
  tooLargeCode: 'SCRIPT_MEDIA_TOO_LARGE',
  invalidCode: 'SCRIPT_MEDIA_INVALID',
});

// Flatten multer .fields() output into one ordered list: legacy thumbnail first
// (it's the cover), then the photos[] in submitted order.
function incomingPhotoFiles(req) {
  const f = req.files || {};
  return [...(f.thumbnail || []), ...(f.photos || [])];
}

// Process + upload one script media file (image or video) → public URL.
function uploadScriptPhoto(file) {
  return uploadMedia(file, {
    imagePrefix: 'custom-script-thumbnails/',
    videoPrefix: 'custom-script-videos/',
  });
}

// Enforce per-type size caps (image 5MB / video 20MB), keeping this surface's
// own error_code so the UI can surface exactly why.
function checkMediaSizes(files) {
  return checkMediaSizesShared(files, { tooLargeCode: 'SCRIPT_MEDIA_TOO_LARGE' });
}

// Parses `existingPhotos` (JSON array of kept URLs from multipart) into an array.
const normalizeExistingPhotos = normalizeUrlList;

// Replace a script's photo rows with `urls` (already ordered). Cover = urls[0].
async function replaceScriptPhotos(scriptId, urls) {
  await db.query('DELETE FROM custom_script_photos WHERE script_id = $1', [scriptId]);
  for (let i = 0; i < urls.length; i++) {
    await db.query(
      'INSERT INTO custom_script_photos (script_id, url, sort_order) VALUES ($1, $2, $3)',
      [scriptId, urls[i], i]
    );
  }
}

// Fetch ordered photo URLs for a set of script ids → { scriptId: [url, ...] }.
async function fetchPhotosForScripts(scriptIds) {
  const map = {};
  if (!scriptIds.length) return map;
  try {
    const result = await db.query(
      `SELECT script_id, url FROM custom_script_photos
        WHERE script_id = ANY($1::uuid[])
        ORDER BY script_id, sort_order, created_at`,
      [scriptIds]
    );
    for (const row of result.rows) {
      (map[row.script_id] = map[row.script_id] || []).push(row.url);
    }
  } catch (err) {
    // Degrade to cover-thumbnail-only rather than failing the whole list if the
    // photos table isn't present yet (pre-migration env).
    logError('fetchPhotosForScripts failed', { err: err.message });
  }
  return map;
}

// Parses `tags` form-field (JSON string from multipart) into an array.
// JSON body requests pass an array directly — return as-is in that case.
function normalizeTags(input) {
  if (Array.isArray(input)) return input;
  if (typeof input !== 'string' || input === '') return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// All custom script routes require authentication
router.use(authenticateToken);

// Get custom scripts for user's couple or personal scripts
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Find user's couple
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    const coupleId = coupleResult.rows.length > 0 ? coupleResult.rows[0].id : null;

    // Get custom scripts for the couple OR personal scripts created by this user
    const scriptsResult = await db.query(`
      SELECT
        id, title, category, scenario, location, content, tags, duration,
        thumbnail_url, is_public, created_by, created_at, updated_at
      FROM custom_scripts
      WHERE couple_id = $1 OR (couple_id IS NULL AND created_by = $2)
      ORDER BY created_at DESC
    `, [coupleId, userId]);

    const photosByScript = await fetchPhotosForScripts(scriptsResult.rows.map((s) => s.id));

    const scripts = scriptsResult.rows.map(script => {
      // Fall back to the single cover thumbnail for scripts created before the
      // photo series existed, so the lightbox always has at least one image.
      const photos = photosByScript[script.id]
        || (script.thumbnail_url ? [script.thumbnail_url] : []);
      return {
        id: script.id,
        title: script.title,
        category: script.category,
        scenario: script.scenario,
        location: script.location,
        script: script.content, // Map content to script for frontend compatibility
        tags: script.tags || [],
        duration: script.duration || '15-30分鐘',
        thumbnailUrl: script.thumbnail_url,
        photos,
        isPublic: script.is_public,
        isCustom: true,
        createdBy: script.created_by,
        createdAt: script.created_at
      };
    });

    // Log how many scripts this user's list actually returned, so a
    // "I uploaded it but can't see it" report can be diagnosed from Cloud
    // Logging: compare this count with the client's `custom_scripts.loaded`.
    logInfo('custom_scripts.list', {
      userId,
      coupleId,
      count: scripts.length,
    });

    res.json({
      success: true,
      custom_scripts: scripts
    });

  } catch (error) {
    logDbError('Get custom scripts error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法獲取自訂劇本', error));
  }
});

// Create new custom script — accepts multipart (with an optional `thumbnail`
// cover and/or a `photos[]` series, up to 30) or plain JSON. multer is a no-op
// when content-type is not multipart.
router.post('/', scriptPhotoUpload, [
  body('title')
    .isLength({ min: 1, max: 100 })
    .withMessage('標題必須在1-100個字符之間'),
  body('category')
    .isIn(['romantic', 'adventurous', 'school', 'bold'])
    .withMessage('無效的劇本類別'),
  body('scenario')
    .isLength({ min: 1, max: 500 })
    .withMessage('情境描述必須在1-500個字符之間'),
  body('location')
    .optional({ values: 'falsy' })
    .isLength({ max: 50 })
    .withMessage('場景地點不能超過50個字符'),
  body('content')
    .isLength({ min: 1, max: 50000 })
    .withMessage('劇本內容必須在1-50000個字符之間'),
  body('duration')
    .optional()
    .isLength({ max: 50 })
    .withMessage('時長描述不能超過50個字符'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic 必須是布林值')
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

    const { title, category, scenario, content, duration = '15-30分鐘' } = req.body;
    const location = (req.body.location || '').trim() || null;
    const tags = normalizeTags(req.body.tags);
    const userId = req.user.id;
    // Default to public — marketplace opt-out is per-script. Multipart sends
    // the field as the string 'false'; treat both literals correctly.
    const isPublic = req.body.isPublic === undefined
      ? true
      : !(req.body.isPublic === false || req.body.isPublic === 'false');

    // Find user's couple (optional - users can create personal scripts)
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    // Use couple_id if exists, otherwise null for personal scripts
    const coupleId = coupleResult.rows.length > 0 ? coupleResult.rows[0].id : null;

    // Log every upload attempt so Cloud Logging can confirm the request
    // reached the server (and whether a thumbnail came with it) even when the
    // failure is later/elsewhere.
    const photoFiles = incomingPhotoFiles(req);

    logInfo('custom_scripts.create.attempt', {
      userId,
      coupleId,
      photoCount: photoFiles.length,
      photoBytes: photoFiles.reduce((n, f) => n + (f.size || 0), 0),
      titleLen: (title || '').length,
      contentLen: (content || '').length,
    });

    // Per-script photo cap. Specific message + error_code so the UI can surface
    // exactly why, not a generic failure.
    if (photoFiles.length > MAX_SCRIPT_PHOTOS) {
      logInfo('custom_scripts.photo_limit', { userId, count: photoFiles.length, blocked: true });
      return res.status(400).json({
        success: false,
        message: `每個劇本最多只能上傳 ${MAX_SCRIPT_PHOTOS} 張照片`,
        error_code: 'SCRIPT_PHOTO_LIMIT_REACHED',
      });
    }

    // Per-type size cap (image 5MB / video 20MB).
    const oversize = checkMediaSizes(photoFiles);
    if (oversize) {
      logWarn('custom_scripts.media_too_large', { userId, blocked: true });
      return res.status(oversize.status).json(oversize.body);
    }

    // Freemium cap: free couples may keep only N custom scripts; premium is
    // unlimited. Count the same set the GET endpoint returns (couple scripts +
    // this user's personal scripts) so the number matches what the user sees.
    const tier = await getCoupleTier(coupleId);
    if (Number.isFinite(getLimit(tier, 'custom_scripts_total'))) {
      const countResult = await db.query(
        `SELECT COUNT(*)::int AS c FROM custom_scripts
          WHERE couple_id = $1 OR (couple_id IS NULL AND created_by = $2)`,
        [coupleId, userId]
      );
      const used = countResult.rows[0]?.c || 0;
      const limitCheck = checkLimit({ tier, key: 'custom_scripts_total', used });
      if (!limitCheck.ok) {
        logInfo('custom_scripts.limit', { userId, coupleId, used, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }
    }

    // Upload all photos (in submitted order); the first is the cover thumbnail.
    const photoUrls = [];
    for (const file of photoFiles) {
      photoUrls.push(await uploadScriptPhoto(file));
    }
    const thumbnailUrl = photoUrls[0] || null;

    // Insert custom script
    const scriptResult = await db.query(`
      INSERT INTO custom_scripts (
        couple_id, title, category, scenario, location, content, tags, duration, created_by, thumbnail_url, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, title, category, scenario, location, content, tags, duration, thumbnail_url, is_public, created_by, created_at
    `, [coupleId, title, category, scenario, location, content, JSON.stringify(tags), duration, userId, thumbnailUrl, isPublic]);

    const script = scriptResult.rows[0];

    if (photoUrls.length > 0) {
      await replaceScriptPhotos(script.id, photoUrls);
    }

    logInfo('custom_scripts.create.success', {
      userId,
      coupleId,
      scriptId: script.id,
      photoCount: photoUrls.length,
    });

    notifyPartnerAction({
      actorId: userId,
      type: 'custom_script_created',
      content: script.title ? `《${script.title}》` : null,
    });

    res.json({
      success: true,
      message: '劇本創建成功',
      custom_script: {
        id: script.id,
        title: script.title,
        category: script.category,
        scenario: script.scenario,
        location: script.location,
        script: script.content,
        tags: Array.isArray(script.tags) ? script.tags : JSON.parse(script.tags || '[]'),
        duration: script.duration,
        thumbnailUrl: script.thumbnail_url,
        photos: photoUrls.length > 0 ? photoUrls : (script.thumbnail_url ? [script.thumbnail_url] : []),
        isPublic: script.is_public,
        isCustom: true,
        createdBy: script.created_by,
        createdAt: script.created_at
      }
    });

  } catch (error) {
    logDbError('Create custom script error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('創建劇本失敗', error));
  }
});

// Update custom script — accepts multipart (with an optional `thumbnail` cover
// and/or `photos[]` series, plus `existingPhotos` listing kept URLs) or plain
// JSON, mirroring the POST handler.
router.put('/:id', scriptPhotoUpload, [
  body('title')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('標題必須在1-100個字符之間'),
  body('category')
    .optional()
    .isIn(['romantic', 'adventurous', 'school', 'bold'])
    .withMessage('無效的劇本類別'),
  body('scenario')
    .optional()
    .isLength({ min: 1, max: 500 })
    .withMessage('情境描述必須在1-500個字符之間'),
  body('location')
    .optional({ values: 'falsy' })
    .isLength({ max: 50 })
    .withMessage('場景地點不能超過50個字符'),
  body('content')
    .optional()
    .isLength({ min: 1, max: 50000 })
    .withMessage('劇本內容必須在1-50000個字符之間'),
  body('duration')
    .optional()
    .isLength({ max: 50 })
    .withMessage('時長描述不能超過50個字符'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic 必須是布林值')
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

    const scriptId = req.params.id;
    const userId = req.user.id;
    const updates = { ...req.body };

    // Normalize isPublic: multipart sends as string, JSON sends as bool.
    if (updates.isPublic !== undefined) {
      updates.isPublic = !(updates.isPublic === false || updates.isPublic === 'false');
    }

    // Normalize tags: in multipart it arrives as a JSON string; in JSON as an array.
    if (updates.tags !== undefined) {
      updates.tags = normalizeTags(updates.tags);
    }

    // Normalize location: empty string clears it back to NULL.
    if (updates.location !== undefined) {
      updates.location = (updates.location || '').trim() || null;
    }

    // Verify script ownership - check if user created it or is in the couple
    const scriptResult = await db.query(`
      SELECT cs.*
      FROM custom_scripts cs
      LEFT JOIN couples c ON cs.couple_id = c.id
      WHERE cs.id = $1 AND (
        cs.created_by = $2 OR
        c.user1_id = $2 OR
        c.user2_id = $2
      )
    `, [scriptId, userId]);

    if (scriptResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到劇本或無權限修改'
      });
    }

    // Photo series handling. The client sends `existingPhotos` (kept URLs, in
    // order) and/or new `photos[]`/`thumbnail` files. We only touch the photo
    // set when one of those is present — a metadata-only edit (e.g. title) or a
    // legacy JSON request leaves photos untouched. Orphaned storage objects are
    // left for a janitor sweep (matches the previous thumbnail behavior).
    const photoFiles = incomingPhotoFiles(req);
    const hasExistingPhotosField = req.body.existingPhotos !== undefined;
    const rebuildPhotos = hasExistingPhotosField || photoFiles.length > 0;

    let newThumbnailUrl = null;
    let finalPhotoUrls = null;
    if (rebuildPhotos) {
      const kept = normalizeExistingPhotos(req.body.existingPhotos);
      if (kept.length + photoFiles.length > MAX_SCRIPT_PHOTOS) {
        logInfo('custom_scripts.photo_limit', { userId, scriptId, count: kept.length + photoFiles.length, blocked: true });
        return res.status(400).json({
          success: false,
          message: `每個劇本最多只能上傳 ${MAX_SCRIPT_PHOTOS} 張照片`,
          error_code: 'SCRIPT_PHOTO_LIMIT_REACHED',
        });
      }
      const oversize = checkMediaSizes(photoFiles);
      if (oversize) {
        logWarn('custom_scripts.media_too_large', { userId, scriptId, blocked: true });
        return res.status(oversize.status).json(oversize.body);
      }
      const uploaded = [];
      for (const file of photoFiles) {
        uploaded.push(await uploadScriptPhoto(file));
      }
      finalPhotoUrls = [...kept, ...uploaded];
      // Cover thumbnail = first photo (or null when the series was cleared).
      newThumbnailUrl = finalPhotoUrls[0] || null;
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (['title', 'category', 'scenario', 'location', 'content', 'duration'].includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        updateValues.push(updates[key]);
        paramIndex++;
      } else if (key === 'tags') {
        updateFields.push(`tags = $${paramIndex}`);
        updateValues.push(JSON.stringify(updates[key]));
        paramIndex++;
      } else if (key === 'isPublic') {
        updateFields.push(`is_public = $${paramIndex}`);
        updateValues.push(updates[key]);
        paramIndex++;
      }
    });

    // When rebuilding the photo set, sync thumbnail_url to the new cover —
    // including null when the user cleared every photo.
    if (rebuildPhotos) {
      updateFields.push(`thumbnail_url = $${paramIndex}`);
      updateValues.push(newThumbnailUrl);
      paramIndex++;
    }

    if (updateFields.length === 0 && !rebuildPhotos) {
      return res.status(400).json({
        success: false,
        message: '沒有提供有效的更新字段'
      });
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(scriptId);

    // RETURNING includes thumbnail_url so the client always sees canonical
    // state even when the thumbnail wasn't changed in this request.
    const updateQuery = `
      UPDATE custom_scripts
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, title, category, scenario, location, content, tags, duration, thumbnail_url, is_public, created_by, created_at, updated_at
    `;

    const updatedResult = await db.query(updateQuery, updateValues);
    const script = updatedResult.rows[0];

    if (rebuildPhotos) {
      await replaceScriptPhotos(scriptId, finalPhotoUrls);
    }

    // Canonical photo series for the client: the rebuilt set, else whatever is
    // already stored (falling back to the cover thumbnail for legacy scripts).
    const photos = rebuildPhotos
      ? finalPhotoUrls
      : ((await fetchPhotosForScripts([scriptId]))[scriptId]
          || (script.thumbnail_url ? [script.thumbnail_url] : []));

    notifyPartnerAction({
      actorId: userId,
      type: 'custom_script_updated',
      content: script.title ? `《${script.title}》` : null,
    });

    res.json({
      success: true,
      message: '劇本更新成功',
      custom_script: {
        id: script.id,
        title: script.title,
        category: script.category,
        scenario: script.scenario,
        location: script.location,
        script: script.content,
        tags: Array.isArray(script.tags) ? script.tags : JSON.parse(script.tags || '[]'),
        duration: script.duration,
        thumbnailUrl: script.thumbnail_url,
        photos,
        isPublic: script.is_public,
        isCustom: true,
        createdBy: script.created_by,
        createdAt: script.created_at
      }
    });

  } catch (error) {
    logDbError('Update custom script error:', error, { user_id: req.user?.id, script_id: req.params.id });
    res.status(500).json(errorResponseBody('更新劇本失敗', error));
  }
});

// Delete custom script
router.delete('/:id', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.user.id;

    // Verify script ownership - check if user created it or is in the couple
    const scriptResult = await db.query(`
      SELECT cs.id, cs.title
      FROM custom_scripts cs
      LEFT JOIN couples c ON cs.couple_id = c.id
      WHERE cs.id = $1 AND (
        cs.created_by = $2 OR
        c.user1_id = $2 OR
        c.user2_id = $2
      )
    `, [scriptId, userId]);

    if (scriptResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到劇本或無權限刪除'
      });
    }

    await db.query('DELETE FROM custom_scripts WHERE id = $1', [scriptId]);

    notifyPartnerAction({
      actorId: userId,
      type: 'custom_script_deleted',
      content: scriptResult.rows[0].title ? `《${scriptResult.rows[0].title}》` : null,
    });

    res.json({
      success: true,
      message: '劇本刪除成功'
    });

  } catch (error) {
    logError('Delete custom script failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '刪除劇本失敗'
    });
  }
});

// POST /:id/share — email the requester's partner about this script to spark
// interest ("come log in and take a look"). Deliberate user action, so it
// reports clear feedback (unpaired / no email / opted out) rather than failing
// silently. Honors the partner's "Email 通知" switch.
router.post('/:id/share', async (req, res) => {
  try {
    const scriptId = req.params.id;
    const userId = req.user.id;

    // The script must exist and belong to the user (or their couple).
    const scriptResult = await db.query(`
      SELECT cs.id, cs.title, cs.scenario
      FROM custom_scripts cs
      LEFT JOIN couples c ON cs.couple_id = c.id
      WHERE cs.id = $1 AND (cs.created_by = $2 OR c.user1_id = $2 OR c.user2_id = $2)
    `, [scriptId, userId]);

    if (scriptResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: '找不到劇本或無權限分享' });
    }
    const script = scriptResult.rows[0];

    // Resolve the partner with clear, distinct feedback per failure mode.
    const partnerResult = await db.query(`
      SELECT u.email, u.nickname, u.email_notifications_enabled
        FROM couples c
        JOIN users u ON u.id = CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END
       WHERE (c.user1_id = $1 OR c.user2_id = $1) AND c.user2_id IS NOT NULL
    `, [userId]);
    const partner = partnerResult.rows[0];

    if (!partner) {
      return res.json({ success: false, message: '你還沒有配對伴侶，無法分享。' });
    }
    if (!partner.email) {
      return res.json({ success: false, message: '找不到伴侶的電子郵件地址，請請伴侶更新資訊。' });
    }
    if (partner.email_notifications_enabled === false) {
      return res.json({ success: false, message: '你的伴侶已關閉 Email 通知，目前無法分享。' });
    }
    if (!emailService.isConfigured()) {
      return res.json({ success: false, message: '信件服務尚未設定，因此暫時無法分享。' });
    }

    await emailService.sendScriptShareEmail({
      recipientEmail: partner.email,
      sharerName: req.user.nickname || '你的伴侶',
      scriptTitle: script.title,
      scenario: script.scenario,
    });
    logInfo('Custom script shared with partner', { scriptId });

    res.json({ success: true, message: `已將「${script.title}」分享到伴侶的信箱。` });
  } catch (error) {
    logWarn('Share custom script failed', { id: req.params.id, err: error.message });
    res.status(500).json({ success: false, message: '分享失敗，請稍後再試。' });
  }
});

// POST /ai-parse-roles — Premium: AI identifies the speakers in a pasted
// script and infers each character's gender, so the upload modal can pre-fill
// the 角色對應 panel and rewrite names into [男]/[女] tokens. Free couples get
// a specific upgrade prompt (error_code AI_ROLE_PARSE_PREMIUM_ONLY), never a
// generic failure.
router.post('/ai-parse-roles', [
  body('content')
    .isString()
    .isLength({ min: 1, max: 50000 })
    .withMessage('劇本內容必須在1-50000個字符之間'),
], async (req, res) => {
  const userId = req.user.id;
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '請先貼上劇本內容再使用 AI 角色辨識',
        errors: errors.array(),
      });
    }

    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );
    const coupleId = coupleResult.rows.length > 0 ? coupleResult.rows[0].id : null;

    const tier = await getCoupleTier(coupleId);
    if (tier !== 'premium') {
      logInfo('custom_scripts.ai_parse_roles.premium_blocked', { userId, coupleId, tier });
      return res.status(403).json({
        success: false,
        message: 'AI 角色辨識是 Premium 專屬功能。升級後，匯入劇本時 AI 會自動判斷每個角色的性別並帶入你們的暱稱。',
        error_code: 'AI_ROLE_PARSE_PREMIUM_ONLY',
      });
    }

    logInfo('custom_scripts.ai_parse_roles.attempt', {
      userId, coupleId, contentLen: req.body.content.length,
    });

    const { roles } = await llmService.parseScriptRoles({ content: req.body.content });

    logInfo('custom_scripts.ai_parse_roles.success', {
      userId, coupleId, roleCount: roles.length,
    });
    res.json({ success: true, roles });
  } catch (error) {
    logError('AI parse script roles failed', { userId, err: error.message });
    res.status(502).json({
      success: false,
      message: 'AI 角色辨識暫時無法使用，請稍後再試，或直接在「角色對應」手動指定男／女。',
      error_code: 'AI_ROLE_PARSE_FAILED',
    });
  }
});

// POST /import-gdoc — fetch the plain-text export of a public Google Doc so
// the upload modal can pre-fill script content. The user pastes any share
// link; we extract the document id and construct the export URL ourselves —
// the user-supplied URL is never fetched, so there's no SSRF surface.
const GDOC_ID_PATTERN = /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{10,})/;
const GDOC_TIMEOUT_MS = 10000;
// Matches the content max length (50k chars) with headroom for trimming.
const GDOC_MAX_CHARS = 60000;

router.post('/import-gdoc', [
  body('url')
    .isString()
    .isLength({ min: 10, max: 500 })
    .withMessage('請提供 Google 文件連結'),
], async (req, res) => {
  const userId = req.user.id;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: '請提供 Google 文件連結',
      error_code: 'GDOC_INVALID_URL',
      errors: errors.array(),
    });
  }

  const match = String(req.body.url).match(GDOC_ID_PATTERN);
  if (!match) {
    logWarn('custom_scripts.import_gdoc.bad_url', { userId });
    return res.status(400).json({
      success: false,
      message: '這不是有效的 Google 文件連結。請貼上 docs.google.com/document/d/… 開頭的分享連結。',
      error_code: 'GDOC_INVALID_URL',
    });
  }

  const docId = match[1];
  logInfo('custom_scripts.import_gdoc.attempt', { userId, docId });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GDOC_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://docs.google.com/document/d/${docId}/export?format=txt`,
      { signal: controller.signal, redirect: 'follow' }
    );

    // A private doc redirects to the Google login page (HTML) or returns
    // 401/403/404 — either way the caller needs to open link sharing.
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('text/plain')) {
      logWarn('custom_scripts.import_gdoc.not_public', {
        userId, docId, status: response.status, contentType,
      });
      return res.status(422).json({
        success: false,
        message: '無法讀取這份文件。請在 Google 文件按「共用」，把權限設為「知道連結的任何人皆可檢視」後再試一次。',
        error_code: 'GDOC_NOT_PUBLIC',
      });
    }

    // Normalize Windows newlines and strip the BOM the export prepends.
    const text = (await response.text()).replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();

    if (!text) {
      return res.status(422).json({
        success: false,
        message: '這份文件是空的，沒有內容可以匯入。',
        error_code: 'GDOC_EMPTY',
      });
    }
    if (text.length > GDOC_MAX_CHARS) {
      logInfo('custom_scripts.import_gdoc.too_long', { userId, docId, chars: text.length });
      return res.status(422).json({
        success: false,
        message: `文件內容約 ${text.length.toLocaleString()} 字，超過劇本 50,000 字上限。請先在文件中縮短內容再匯入。`,
        error_code: 'GDOC_TOO_LONG',
      });
    }

    // First non-empty line doubles as a title suggestion for empty forms.
    const suggestedTitle = (text.split('\n').find((l) => l.trim()) || '').trim().slice(0, 100);

    logInfo('custom_scripts.import_gdoc.success', { userId, docId, chars: text.length });
    res.json({ success: true, content: text, suggestedTitle });
  } catch (error) {
    const timedOut = error.name === 'AbortError';
    logWarn('custom_scripts.import_gdoc.fetch_failed', {
      userId, docId, timedOut, err: error.message,
    });
    res.status(timedOut ? 504 : 502).json({
      success: false,
      message: timedOut
        ? '讀取 Google 文件逾時，請稍後再試，或直接複製文件內容貼到「劇本內容」。'
        : '暫時無法連線到 Google 文件，請稍後再試，或直接複製文件內容貼到「劇本內容」。',
      error_code: timedOut ? 'GDOC_TIMEOUT' : 'GDOC_FETCH_FAILED',
    });
  } finally {
    clearTimeout(timer);
  }
});

module.exports = router;