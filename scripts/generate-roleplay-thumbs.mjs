// Builds web-sized WebP copies of the built-in roleplay cover art.
//
// The source PNGs in public/images/roleplay/ are 1.1–1.8MB each (~15MB for the
// set), and the script list used to load every one of them just to paint small
// cards — the "劇本縮圖很慢" complaint. This writes two variants per cover:
//
//   images/roleplay/<name>.webp        1280px long edge — detail / lightbox
//   images/roleplay/thumb/<name>.webp   480px long edge — list cards
//
// Resize is `fit: 'inside'` (never crops — see CLAUDE.md "Never crop images").
// Re-run after adding or replacing a cover:  node scripts/generate-roleplay-thumbs.mjs
import { readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'images', 'roleplay');
const thumbDir = path.join(dir, 'thumb');

const VARIANTS = [
  { outDir: dir, size: 1280, quality: 80 },
  { outDir: thumbDir, size: 480, quality: 75 },
];

await mkdir(thumbDir, { recursive: true });
const sources = (await readdir(dir)).filter((f) => /\.(png|jpe?g)$/i.test(f));

for (const file of sources) {
  const base = file.replace(/\.(png|jpe?g)$/i, '');
  const input = path.join(dir, file);
  const sizes = [];
  for (const { outDir, size, quality } of VARIANTS) {
    const out = path.join(outDir, `${base}.webp`);
    await sharp(input)
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toFile(out);
    sizes.push(`${size}px ${Math.round((await stat(out)).size / 1024)}KB`);
  }
  const original = Math.round((await stat(input)).size / 1024);
  console.log(`${file}: ${original}KB → ${sizes.join(', ')}`);
}
