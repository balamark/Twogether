const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { uploadToSupabase } = require('./supabase-storage');
const { logWarn } = require('./logger');

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 30 * 1024 * 1024;

const mb = (bytes) => Math.round(bytes / (1024 * 1024));

const MEDIA_EXTENSION_RE = /\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v)$/i;
const VIDEO_EXTENSION_RE = /\.(mp4|webm|mov|m4v)$/i;

function isVideoFile(file) {
  return /^video\//i.test(file.mimetype || '')
    || VIDEO_EXTENSION_RE.test(file.originalname || '');
}

async function processImage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, progressive: true, mozjpeg: true })
    .toBuffer();
}

async function processThumbnail(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
}

async function uploadMedia(file, { imagePrefix, videoPrefix, thumbnail = false }) {
  if (isVideoFile(file)) {
    const ext = (file.originalname.match(VIDEO_EXTENSION_RE)?.[1] || 'mp4').toLowerCase();
    const mimeType = file.mimetype && /^video\//i.test(file.mimetype)
      ? file.mimetype
      : (ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4');
    const fileName = `${videoPrefix}${uuidv4()}-${Date.now()}.${ext}`;
    return uploadToSupabase(file.buffer, fileName, mimeType);
  }
  const processed = await processImage(file.buffer);
  const base = `${imagePrefix}${uuidv4()}-${Date.now()}`;
  const url = await uploadToSupabase(processed, `${base}.jpg`, 'image/jpeg');
  if (thumbnail) {
    try {
      const thumb = await processThumbnail(processed);
      await uploadToSupabase(thumb, `${base}.thumb.webp`, 'image/webp');
    } catch (err) {
      logWarn('media thumbnail upload failed; client will use the full image', { fileName: `${base}.jpg`, err: err.message });
    }
  }
  return url;
}

function checkMediaSizes(files, { tooLargeCode = 'MEDIA_TOO_LARGE' } = {}) {
  for (const file of files) {
    const isVideo = isVideoFile(file);
    const max = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if ((file.size || 0) > max) {
      const limitMb = mb(max);
      return {
        status: 400,
        body: {
          success: false,
          message: isVideo
            ? `影片大小不能超過 ${limitMb}MB，請壓縮或改用較短的片段後再試。`
            : `每張照片大小不能超過 ${limitMb}MB，請壓縮後再試。`,
          error_code: tooLargeCode,
        },
      };
    }
  }
  return null;
}

function normalizeUrlList(input) {
  if (Array.isArray(input)) return input.filter((u) => typeof u === 'string');
  if (typeof input !== 'string' || input === '') return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

function createMediaMulter({ maxFiles }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: VIDEO_MAX_BYTES,
      files: maxFiles,
    },
    fileFilter: (req, file, cb) => {
      if (!MEDIA_EXTENSION_RE.test(file.originalname || '')) {
        return cb(new Error('只允許上傳圖片 (jpg, png, webp, gif) 或影片 (mp4, webm, mov)'), false);
      }
      cb(null, true);
    },
  });
}

function wrapMulterErrors(rawMiddleware, { tooLargeCode = 'MEDIA_TOO_LARGE', invalidCode = 'MEDIA_INVALID' } = {}) {
  return (req, res, next) => {
    rawMiddleware(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: `影片大小不能超過 ${mb(VIDEO_MAX_BYTES)}MB，照片不能超過 ${mb(IMAGE_MAX_BYTES)}MB，請壓縮後再試。`,
            error_code: tooLargeCode,
          });
        }
        return res.status(400).json({
          success: false,
          message: '上傳的檔案數量或格式不符，請確認後再試。',
          error_code: invalidCode,
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || '上傳的檔案格式不支援。',
        error_code: invalidCode,
      });
    });
  };
}

module.exports = {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  isVideoFile,
  processImage,
  uploadMedia,
  checkMediaSizes,
  normalizeUrlList,
  createMediaMulter,
  wrapMulterErrors,
};
