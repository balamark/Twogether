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

const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      return cb(new Error('只允許上傳圖片文件 (jpg, jpeg, png, webp, gif)'), false);
    }
    cb(null, true);
  },
});

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

    const scripts = scriptsResult.rows.map(script => ({
      id: script.id,
      title: script.title,
      category: script.category,
      scenario: script.scenario,
      script: script.content, // Map content to script for frontend compatibility
      tags: script.tags || [],
      duration: script.duration || '15-30分鐘',
      thumbnailUrl: script.thumbnail_url,
      isPublic: script.is_public,
      isCustom: true,
      createdBy: script.created_by,
      createdAt: script.created_at
    }));

    res.json({
      success: true,
      custom_scripts: scripts
    });

  } catch (error) {
    logDbError('Get custom scripts error:', error, { user_id: req.user?.id });
    res.status(500).json(errorResponseBody('無法獲取自訂劇本', error));
  }
});

// Create new custom script — accepts multipart (with optional `thumbnail` file)
// or plain JSON. multer is a no-op when content-type is not multipart.
router.post('/', thumbnailUpload.single('thumbnail'), [
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
    logInfo('custom_scripts.create.attempt', {
      userId,
      coupleId,
      hasThumbnail: !!req.file,
      thumbnailBytes: req.file ? req.file.size : 0,
      titleLen: (title || '').length,
      contentLen: (content || '').length,
    });

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

    let thumbnailUrl = null;
    if (req.file) {
      const processed = await processThumbnail(req.file.buffer);
      const fileName = `custom-script-thumbnails/${uuidv4()}-${Date.now()}.jpg`;
      thumbnailUrl = await uploadToSupabase(processed, fileName, 'image/jpeg');
    }

    // Insert custom script
    const scriptResult = await db.query(`
      INSERT INTO custom_scripts (
        couple_id, title, category, scenario, content, tags, duration, created_by, thumbnail_url, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, title, category, scenario, content, tags, duration, thumbnail_url, is_public, created_by, created_at
    `, [coupleId, title, category, scenario, content, JSON.stringify(tags), duration, userId, thumbnailUrl, isPublic]);

    const script = scriptResult.rows[0];

    logInfo('custom_scripts.create.success', {
      userId,
      coupleId,
      scriptId: script.id,
      hasThumbnail: !!thumbnailUrl,
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

// Update custom script — accepts multipart (with optional `thumbnail` file)
// or plain JSON, mirroring the POST handler.
router.put('/:id', thumbnailUpload.single('thumbnail'), [
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

    // If a new thumbnail file was uploaded, process and persist it. The
    // previous thumbnail in storage isn't deleted (matches POST behavior —
    // a janitor sweep can clean orphans later).
    let newThumbnailUrl = null;
    if (req.file) {
      const processed = await processThumbnail(req.file.buffer);
      const fileName = `custom-script-thumbnails/${uuidv4()}-${Date.now()}.jpg`;
      newThumbnailUrl = await uploadToSupabase(processed, fileName, 'image/jpeg');
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

    if (newThumbnailUrl) {
      updateFields.push(`thumbnail_url = $${paramIndex}`);
      updateValues.push(newThumbnailUrl);
      paramIndex++;
    }

    if (updateFields.length === 0) {
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