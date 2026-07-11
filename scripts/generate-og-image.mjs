#!/usr/bin/env node
// Generates the social-sharing image (public/images/og-image.png, 1200×630)
// and the iOS home-screen icon (public/apple-touch-icon.png, 180×180) from
// inline SVG, rasterized with sharp. Run manually after changing the brand
// mark or tagline, then commit the PNGs:
//
//   node scripts/generate-og-image.mjs
//
// The Chinese tagline needs a Traditional-Chinese font available to
// fontconfig at render time (any Noto Sans TC / CJK or WenQuanYi install
// works); the font-family list below falls back through the common ones.

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CREAM = '#fbf7f2';
const CREAM_2 = '#f2ebdf';
const ROSE = '#d4938a';
const SAGE_DEEP = '#7d8f75';
const INK = '#2a2520';
const MUTED = '#8a7e72';

const SERIF = 'DejaVu Serif, Noto Serif TC, serif';
const CJK = 'Noto Sans TC, Noto Sans CJK TC, WenQuanYi Zen Hei, sans-serif';

// Interlocking-rings brand mark (same geometry as public/favicon.svg),
// positioned via a wrapping <g transform>.
const mark = (x, y, scale) => `
  <g transform="translate(${x} ${y}) scale(${scale})">
    <circle cx="32" cy="32" r="32" fill="url(#g)"/>
    <circle cx="25" cy="32" r="11" fill="none" stroke="${CREAM}" stroke-width="3.5"/>
    <circle cx="39" cy="32" r="11" fill="none" stroke="${CREAM}" stroke-width="3.5"/>
  </g>`;

const gradientDef = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ROSE}"/>
      <stop offset="1" stop-color="${SAGE_DEEP}"/>
    </linearGradient>
    <linearGradient id="strip" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ROSE}"/>
      <stop offset="1" stop-color="${SAGE_DEEP}"/>
    </linearGradient>
  </defs>`;

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${gradientDef}
  <rect width="1200" height="630" fill="${CREAM}"/>
  <circle cx="1120" cy="-40" r="220" fill="${CREAM_2}"/>
  <circle cx="60" cy="660" r="180" fill="${CREAM_2}"/>
  ${mark(536, 108, 2)}
  <text x="600" y="342" text-anchor="middle" font-family="${SERIF}" font-size="88" font-weight="600" fill="${INK}">Twogether</text>
  <text x="600" y="426" text-anchor="middle" font-family="${CJK}" font-size="36" fill="${INK}">攜手共度，讓愛情更美好</text>
  <text x="600" y="486" text-anchor="middle" font-family="${CJK}" font-size="24" fill="${MUTED}">為情侶設計的親密時光紀錄 App</text>
  <text x="600" y="566" text-anchor="middle" font-family="${SERIF}" font-size="22" fill="${MUTED}">twogether.fun</text>
  <rect x="0" y="622" width="1200" height="8" fill="url(#strip)"/>
</svg>`;

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 64 64">
  ${gradientDef}
  <rect width="64" height="64" fill="url(#g)"/>
  <circle cx="25" cy="32" r="11" fill="none" stroke="${CREAM}" stroke-width="3.5"/>
  <circle cx="39" cy="32" r="11" fill="none" stroke="${CREAM}" stroke-width="3.5"/>
</svg>`;

const render = async (svg, out, width, height) => {
  const png = await sharp(Buffer.from(svg)).resize(width, height).png().toBuffer();
  await writeFile(path.join(root, out), png);
  console.log(`${out}: ${width}×${height}, ${(png.length / 1024).toFixed(1)} KB`);
};

await render(ogSvg, 'public/images/og-image.png', 1200, 630);
await render(iconSvg, 'public/apple-touch-icon.png', 180, 180);
