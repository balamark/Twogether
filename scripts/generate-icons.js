#!/usr/bin/env node
/**
 * Generates PWA app icons for Twogether.
 * Uses the `sharp` package (already a project dependency).
 * Pink-to-purple gradient with white heart symbol.
 *
 * Usage: node scripts/generate-icons.js
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

// SVG template: pink-purple gradient background + white heart
function makeSvg(size) {
  const cx = size / 2;
  const cy = size / 2;
  // Heart path scaled to ~60% of icon size
  const scale = size * 0.003; // base scale factor
  const heartSize = size * 0.55;
  const hx = cx - heartSize / 2;
  const hy = cy - heartSize / 2.4;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#E91E63;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#9C27B0;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F8BBD0;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#E1BEE7;stop-opacity:0.1" />
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#bg)"/>
  <!-- Subtle inner glow -->
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#bg2)"/>
  <!-- White heart icon centered -->
  <g transform="translate(${cx}, ${cy * 0.95}) scale(${size / 512})">
    <path d="M0,-60
             C-15,-90 -60,-90 -75,-55
             C-95,-15 -60,30 0,80
             C60,30 95,-15 75,-55
             C60,-90 15,-90 0,-60 Z"
          fill="white"
          fill-opacity="0.95"/>
  </g>
</svg>`.trim();
}

async function generateIcon(size, filename) {
  const svg = Buffer.from(makeSvg(size));
  const outputPath = path.join(publicDir, filename);
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(outputPath);
  console.log(`Generated: ${filename} (${size}x${size})`);
}

async function main() {
  await generateIcon(192, 'pwa-192x192.png');
  await generateIcon(512, 'pwa-512x512.png');
  await generateIcon(180, 'apple-touch-icon.png');
  await generateIcon(152, 'pwa-152x152.png');
  await generateIcon(120, 'pwa-120x120.png');
  console.log('All icons generated successfully!');
}

main().catch(console.error);
