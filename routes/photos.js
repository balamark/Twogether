const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { uploadToSupabase } = require('../lib/supabase-storage');
const { getCoupleTier, getLimit, checkLimit } = require('../lib/entitlements');
const { logInfo, logError } = require('../lib/logger');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return cb(new Error('只允許上傳圖片文件 (jpg, jpeg, png, gif, webp)'), false);
    }
    cb(null, true);
  }
});

// All photo routes require authentication
router.use(authenticateToken);

// Upload photo
router.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '請選擇要上傳的圖片'
      });
    }

    const userId = req.user.id;

    // Check if user has a couple
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    if (coupleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '您還沒有情侶關係'
      });
    }

    const coupleId = coupleResult.rows[0].id;

    // Freemium cap: free couples may store up to N photos total; premium is
    // unlimited. Checked before processing/uploading so we don't do work we'll reject.
    const tier = await getCoupleTier(coupleId);
    if (Number.isFinite(getLimit(tier, 'photo_uploads_total'))) {
      const countResult = await db.query(
        'SELECT COUNT(*)::int AS c FROM photos WHERE couple_id = $1',
        [coupleId]
      );
      const used = countResult.rows[0]?.c || 0;
      const limitCheck = checkLimit({ tier, key: 'photo_uploads_total', used });
      if (!limitCheck.ok) {
        logInfo('photos.limit', { coupleId, used, tier, blocked: true });
        return res.status(limitCheck.status).json(limitCheck.body);
      }
    }

    // Process image with sharp
    let processedBuffer;
    let mimeType = 'image/jpeg';
    
    if (req.file.mimetype === 'image/gif') {
      // Don't process GIFs to preserve animation
      processedBuffer = req.file.buffer;
      mimeType = 'image/gif';
    } else {
      processedBuffer = await sharp(req.file.buffer)
        .resize(1200, 1200, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ 
          quality: 85,
          progressive: true 
        })
        .toBuffer();
    }

    // Generate unique filename
    const fileExtension = mimeType === 'image/gif' ? '.gif' : '.jpg';
    const fileName = `${uuidv4()}-${Date.now()}${fileExtension}`;

    // Upload to Supabase
    const photoUrl = await uploadToSupabase(processedBuffer, fileName, mimeType);

    // Save photo record to database. Columns match the actual `photos` schema
    // (migrations 001/003/004): file_path holds the Supabase URL, file_name is
    // the original name, memory_date/upload_date are timestamps. NOTE: there is
    // no `uploaded_by`/`original_name`/`created_at` column on this table.
    const photoId = uuidv4();
    const now = new Date().toISOString();
    const memoryDate = req.body?.memory_date || now;

    const result = await db.query(`
      INSERT INTO photos (id, couple_id, file_path, storage_url, file_name, file_size, mime_type, caption, memory_date, upload_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, file_path, file_name, file_size, upload_date
    `, [
      photoId, coupleId, photoUrl, photoUrl, req.file.originalname,
      processedBuffer.length, mimeType, req.body?.caption || null, memoryDate, now
    ]);

    const photo = result.rows[0];

    logInfo('Photo uploaded', { photoId, coupleId });

    res.status(201).json({
      success: true,
      message: '圖片上傳成功',
      photo: {
        ...photo,
        uploaded_by: {
          id: userId,
          nickname: req.user.nickname
        }
      }
    });

  } catch (error) {
    logError('Photo upload failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: error.message || '圖片上傳失敗'
    });
  }
});

// Get photos for couple
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;

    // Find user's couple
    const coupleResult = await db.query(
      'SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1',
      [userId]
    );

    if (coupleResult.rows.length === 0) {
      return res.json({
        success: true,
        photos: [],
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    }

    const coupleId = coupleResult.rows[0].id;

    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM photos WHERE couple_id = $1',
      [coupleId]
    );
    const total = parseInt(countResult.rows[0].total);

    // Get photos (columns match the actual `photos` schema).
    const result = await db.query(`
      SELECT p.id, p.file_path, p.file_name, p.file_size, p.caption, p.upload_date, p.memory_date
      FROM photos p
      WHERE p.couple_id = $1
      ORDER BY COALESCE(p.upload_date, p.memory_date) DESC
      LIMIT $2 OFFSET $3
    `, [coupleId, parseInt(limit), offset]);

    const photos = result.rows.map(row => ({
      id: row.id,
      file_path: row.file_path,
      file_name: row.file_name,
      file_size: row.file_size,
      caption: row.caption,
      upload_date: row.upload_date,
      memory_date: row.memory_date
    }));

    res.json({
      success: true,
      photos,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (error) {
    logError('Get photos failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '獲取圖片失敗'
    });
  }
});

// Delete photo
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const photoId = req.params.id;

    // Check ownership and delete
    const result = await db.query(`
      DELETE FROM photos 
      WHERE id = $1 AND couple_id IN (
        SELECT id FROM couples WHERE user1_id = $2 OR user2_id = $2
      )
      RETURNING id, file_path
    `, [photoId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的圖片或您沒有權限刪除'
      });
    }

    // TODO: Delete from Supabase storage if needed
    // const filePath = result.rows[0].file_path;

    logInfo('Photo deleted', { photoId });

    res.json({
      success: true,
      message: '圖片刪除成功'
    });

  } catch (error) {
    logError('Delete photo failed', { err: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '刪除圖片失敗'
    });
  }
});

module.exports = router;
