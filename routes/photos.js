const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { uploadToSupabase } = require('../lib/supabase-storage');

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

    // Save photo record to database
    const photoId = uuidv4();
    const now = new Date().toISOString();

    const result = await db.query(`
      INSERT INTO photos (id, couple_id, uploaded_by, file_path, original_name, file_size, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, file_path, original_name, file_size, created_at
    `, [
      photoId, coupleId, userId, photoUrl, req.file.originalname,
      processedBuffer.length, now
    ]);

    const photo = result.rows[0];

    console.log(`✅ Photo uploaded: ${photoId} for couple ${coupleId}`);

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
    console.error('Photo upload error:', error);
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

    // Get photos with user info
    const result = await db.query(`
      SELECT 
        p.id, p.file_path, p.original_name, p.file_size, p.created_at,
        u.id as uploaded_by_id, u.nickname as uploaded_by_nickname
      FROM photos p
      JOIN users u ON p.uploaded_by = u.id
      WHERE p.couple_id = $1
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [coupleId, parseInt(limit), offset]);

    const photos = result.rows.map(row => ({
      id: row.id,
      file_path: row.file_path,
      original_name: row.original_name,
      file_size: row.file_size,
      created_at: row.created_at,
      uploaded_by: {
        id: row.uploaded_by_id,
        nickname: row.uploaded_by_nickname
      }
    }));

    res.json({
      success: true,
      photos,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (error) {
    console.error('Get photos error:', error);
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

    console.log(`✅ Photo deleted: ${photoId}`);

    res.json({
      success: true,
      message: '圖片刪除成功'
    });

  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({
      success: false,
      message: '刪除圖片失敗'
    });
  }
});

module.exports = router;
