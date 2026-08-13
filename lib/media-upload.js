// Shared photo/video upload helpers, used by both the custom-script uploader
// (routes/custom-scripts.js) and the couple wall (routes/wall.js).
//
// The pipeline: multer keeps the file in memory → images are normalized through
// sharp to progressive JPEG, videos are stored raw (no re-encode) so the client
// can render <video> → both land in Supabase Storage as public URLs (see
// lib/supabase-storage.js). Callers pass their own bucket prefixes and
// error_codes so each surface keeps specific, actionable messages.

const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { uploadToSupabase } = require('./supabase-storage');

// Per-file size caps. Videos are stored raw (no re-encode) so they get a larger
// cap than images (which sharp downscales anyway). Kept in sync with
// IMAGE_MAX_BYTES / VIDEO_MAX_BYTES in src/utils/script.ts.
//
// Ceiling: App Engine Standard rejects any request body over 32MB before it
// reaches us (a 413 we can't turn into a friendly message), so the video cap
// has to stay comfortably under that with multipart overhead on top.
const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB per image
const VIDEO_MAX_BYTES = 30 * 1024 * 1024; // 30MB per video

const mb = (bytes) => Math.round(bytes / (1024 * 1024));

const MEDIA_EXTENSION_RE = /\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v)$/i;
const VIDEO_EXTENSION_RE = /\.(mp4|webm|mov|m4v)$/i;

// Is this upload a video? multer only exposes originalname + mimetype in the
// fileFilter, so match on both. (Cover videos display as a "living" cover.)
function isVideoFile(file) {
  return /^video\//i.test(file.mimetype || '')
    || VIDEO_EXTENSION_RE.test(file.originalname || '');
}

// Preserve close-to-original size for the lightbox view; only downscale truly
// huge originals. 2048px long edge fits a 4K display; mozjpeg + q90 keeps detail
// without ballooning bytes. `.rotate()` applies EXIF orientation so portrait
// phone shots aren't stored sideways.
async function processImage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, progressive: true, mozjpeg: true })
    .toBuffer();
}

// Process + upload one media file (image or video), returning its public URL.
// Images are normalized through sharp → JPEG under `imagePrefix`; videos are
// stored raw with their own mime + extension under `videoPrefix`.
async function uploadMedia(file, { imagePrefix, videoPrefix }) {
  if (isVideoFile(file)) {
    const ext = (file.originalname.match(VIDEO_EXTENSION_RE)?.[1] || 'mp4').toLowerCase();
    const mimeType = file.mimetype && /^video\//i.test(file.mimetype)
      ? file.mimetype
      : (ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4');
    const fileName = `${videoPrefix}${uuidv4()}-${Date.now()}.${ext}`;
    return uploadToSupabase(file.buffer, fileName, mimeType);
  }
  const processed = await processImage(file.buffer);
  const fileName = `${imagePrefix}${uuidv4()}-${Date.now()}.jpg`;
  return uploadToSupabase(processed, fileName, 'image/jpeg');
}

// Enforce per-type size caps (see IMAGE_MAX_BYTES / VIDEO_MAX_BYTES) with a
// specific, actionable message + error_code. Returns null when all files are
// within limits, otherwise a { status, body } to send back.
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

// Parses a JSON array of kept URLs (a multipart form field) into a string array.
// Passing an array through returns it filtered; anything else → [].
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

// Build a memoryStorage multer instance with our shared media limits + type
// filter. `maxFiles` caps the total files multer will accept in one request.
function createMediaMulter({ maxFiles }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      // Highest per-file ceiling; the per-type caps are enforced explicitly by
      // checkMediaSizes so each gets a specific message.
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

// Wrap a multer middleware so its errors (oversize file, rejected type) become
// specific, actionable JSON with an error_code instead of a generic 500.
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
      // fileFilter rejections arrive as a plain Error with our own message.
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
