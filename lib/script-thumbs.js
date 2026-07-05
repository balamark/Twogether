// Small grid-thumbnail generation for custom-script covers.
//
// Script photos are stored near-original (2048px q90 JPEG) for the lightbox,
// but the roleplay/marketplace grids render them into 56–144px slots. This
// module produces a dedicated small derivative for `thumbnail_url` so grids
// don't download multi-hundred-KB images. Shared by routes/custom-scripts.js
// (on upload/update) and routes/admin.js (one-shot backfill of old rows).

const axios = require('axios');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { uploadToSupabase } = require('./supabase-storage');
const { logInfo, logWarn } = require('./logger');

// Suffix marks a URL as an already-generated grid thumb, so the backfill can
// tell processed rows from legacy full-size covers.
const THUMB_SUFFIX = '-thumb.webp';

function isGridThumbUrl(url) {
  return typeof url === 'string' && url.endsWith(THUMB_SUFFIX);
}

// 512px covers the largest grid slot (144px @3x) and the marketplace
// aspect-video card; webp q80 keeps covers in the tens of KB.
async function processGridThumb(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

// Fetch an already-uploaded photo back as a buffer (for covers kept from a
// previous upload, or for the backfill, where no upload buffer exists).
async function downloadImage(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    maxContentLength: 25 * 1024 * 1024,
  });
  return Buffer.from(response.data);
}

// Generate + upload the small grid thumb for a script cover and return its
// public URL. `buffer` is preferred (cover was just uploaded in this request);
// otherwise the cover is re-downloaded from `coverUrl`. Never throws: on any
// failure it logs and falls back to the full-size cover URL, so a thumbnail
// hiccup can't fail the create/update request.
async function makeCoverThumbUrl({ buffer = null, coverUrl = null, scriptId = null } = {}) {
  if (!buffer && !coverUrl) return null;
  try {
    const source = buffer || (await downloadImage(coverUrl));
    const thumb = await processGridThumb(source);
    const fileName = `custom-script-thumbnails/${uuidv4()}-${Date.now()}${THUMB_SUFFIX}`;
    const url = await uploadToSupabase(thumb, fileName, 'image/webp');
    logInfo('custom_scripts.thumb.generated', {
      scriptId,
      bytesIn: source.length,
      bytesOut: thumb.length,
      fromBuffer: !!buffer,
    });
    return url;
  } catch (err) {
    logWarn('custom_scripts.thumb.failed', {
      scriptId,
      coverUrl,
      fromBuffer: !!buffer,
      error: err.message,
    });
    return coverUrl;
  }
}

module.exports = { processGridThumb, makeCoverThumbUrl, downloadImage, isGridThumbUrl, THUMB_SUFFIX };
