const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { uploadToSupabase } = require('../lib/supabase-storage');
const { getCoupleTier, getLimit, checkLimit } = require('../lib/entitlements');
const { logDbError, errorResponseBody } = require('../lib/db-errors');
const { logError, logInfo } = require('../lib/logger');

const router = express.Router();

// Max photos a single custom script may carry (cover + extras).
const MAX_SCRIPT_PHOTOS = 30;

const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per image
    files: MAX_SCRIPT_PHOTOS + 1, // up to 30 photos (+ legacy single `thumbnail`)
  },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      return cb(new Error('只允許上傳圖片文件 (jpg, jpeg, png, webp, gif)'), false);
    }
    cb(null, true);
  },
});

// Accept both the legacy single `thumbnail` field and the new `photos[]` field
// so old clients keep working while the modal sends a multi-photo series.
const scriptPhotoUpload = thumbnailUpload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'photos', maxCount: MAX_SCRIPT_PHOTOS },
]);

// Flatten multer .fields() output into one ordered list: legacy thumbnail first
// (it's the cover), then the photos[] in submitted order.
function incomingPhotoFiles(req) {
  const f = req.files || {};
  return [...(f.thumbnail || []), ...(f.photos || [])];
}

// Process + upload one image, returning its public URL.
async function uploadScriptPhoto(buffer) {
  const processed = await processThumbnail(buffer);
  const fileName = `custom-script-thumbnails/${uuidv4()}-${Date.now()}.jpg`;
  return uploadToSupabase(processed, fileName, 'image/jpeg');
}

// Parses `existingPhotos` (JSON array of kept URLs from multipart) into an array.
function normalizeExistingPhotos(input) {
  if (Array.isArray(input)) return input.filter((u) => typeof u === 'string');
  if (typeof input !== 'string' || input === '') return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

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

// Preserve close-to-original size for the lightbox view; only downscale truly
// huge originals. 2048px long edge fits a 4K display; mozjpeg + q90 keeps
// detail without ballooning bytes. `.rotate()` applies EXIF orientation so
// portrait phone shots aren't stored sideways.
async function processThumbnail(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, progressive: true, mozjpeg: true })
    .toBuffer();
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
        id, title, category, scenario, content, tags, duration,
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
      photoUrls.push(await uploadScriptPhoto(file.buffer));
    }
    const thumbnailUrl = photoUrls[0] || null;

    // Insert custom script
    const scriptResult = await db.query(`
      INSERT INTO custom_scripts (
        couple_id, title, category, scenario, content, tags, duration, created_by, thumbnail_url, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, title, category, scenario, content, tags, duration, thumbnail_url, is_public, created_by, created_at
    `, [coupleId, title, category, scenario, content, JSON.stringify(tags), duration, userId, thumbnailUrl, isPublic]);

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

    res.json({
      success: true,
      message: '劇本創建成功',
      custom_script: {
        id: script.id,
        title: script.title,
        category: script.category,
        scenario: script.scenario,
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
      const uploaded = [];
      for (const file of photoFiles) {
        uploaded.push(await uploadScriptPhoto(file.buffer));
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
      if (['title', 'category', 'scenario', 'content', 'duration'].includes(key)) {
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
      RETURNING id, title, category, scenario, content, tags, duration, thumbnail_url, is_public, created_by, created_at, updated_at
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

    res.json({
      success: true,
      message: '劇本更新成功',
      custom_script: {
        id: script.id,
        title: script.title,
        category: script.category,
        scenario: script.scenario,
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
      SELECT cs.id
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

module.exports = router;