#!/usr/bin/env node

/**
 * Backfill card thumbnails for custom-script covers
 * ---------------------------------------------------------------------------
 * New uploads write `<name>.thumb.webp` next to each cover (lib/media-upload.js)
 * and the script list loads that instead of the 2048px original. Covers
 * uploaded before that change have no thumbnail, so the list falls back to the
 * full image for them. This script generates the missing ones.
 *
 * Idempotent: a cover whose thumbnail already answers 200 is skipped.
 *
 * Usage (needs the production DATABASE_URL + SUPABASE_* env):
 *   NODE_ENV=production node scripts/backfill-script-thumbnails.js [--dry-run]
 */

const axios = require('axios');
const sharp = require('sharp');
const db = require('../database/db');
const { uploadToSupabase } = require('../lib/supabase-storage');

const DRY_RUN = process.argv.includes('--dry-run');
const COVER_RE = /\/storage\/v1\/object\/public\/([^/]+)\/(custom-script-thumbnails\/[^/?#]+)\.jpg$/i;

async function exists(url) {
  const res = await axios.head(url, { validateStatus: () => true });
  return res.status >= 200 && res.status < 300;
}

async function main() {
  const { rows } = await db.query(
    `SELECT DISTINCT thumbnail_url AS url FROM custom_scripts
      WHERE thumbnail_url ILIKE '%/custom-script-thumbnails/%.jpg'`
  );
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const { url } of rows) {
    const m = url.match(COVER_RE);
    if (!m) { skipped++; continue; }
    const thumbUrl = url.replace(/\.jpg$/i, '.thumb.webp');
    try {
      if (await exists(thumbUrl)) { skipped++; continue; }
      if (DRY_RUN) { console.log(`would create ${thumbUrl}`); created++; continue; }
      const original = await axios.get(url, { responseType: 'arraybuffer' });
      const thumb = await sharp(Buffer.from(original.data))
        .rotate()
        .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
      await uploadToSupabase(thumb, `${m[2]}.thumb.webp`, 'image/webp', m[1]);
      created++;
      console.log(`created ${thumbUrl} (${Math.round(thumb.length / 1024)}KB)`);
    } catch (err) {
      failed++;
      console.error(`failed ${url}: ${err.message}`);
    }
  }
  console.log(`done: ${created} ${DRY_RUN ? 'to create' : 'created'}, ${skipped} skipped, ${failed} failed`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => db.pool?.end?.());
