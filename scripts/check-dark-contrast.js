#!/usr/bin/env node
// Guards Engineer Mode's dark theme against light-on-light (and dark-on-dark) text.
//
// The app's colours are hardcoded Tailwind utility classes, not CSS variables, so
// the dark skin in src/index.css works by listing `.dark .<utility>` overrides. That
// list is easy to forget: add a panel with `bg-blue-50` and, in dark mode, the panel
// keeps its pale background while the `text-gray-900` inside it DOES get flipped to
// near-white — an invisible row (this is exactly how the notification inbox broke).
// The mirror image happens with `text-amber-900` on a background we flipped to dark.
//
// So: collect every light-surface / dark-ink utility the source actually uses, and
// fail if src/index.css has no `.dark` override for it. Style-only check — it never
// renders anything, so it's cheap enough to run next to `check:admin` in CI.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const CSS = path.join(SRC, 'index.css');

// Palettes remapped to Soft Petal in tailwind.config.js (pink/rose/purple/... are
// cream + dusty rose, so their low shades are light too) plus the stock scales.
const PALETTES = [
  'gray', 'slate', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
  'primary', 'romantic', 'lavender', 'love',
].join('|');

// Light surfaces: the 50/100/200 shades, white (incl. `/opacity` variants), and the
// pale Soft Petal tokens. `-300` is excluded — it's already mid-tone enough to carry
// dark ink, and the Soft Petal 300s are used as accents, not surfaces.
const LIGHT_BG = new RegExp(
  `\\bbg-(?:(?:${PALETTES})-(?:50|100|200)|white|petal-(?:cream-2|cream|rose-soft|rule|muted))(?:\\/\\d+)?\\b`,
  'g'
);

// Ink meant for light surfaces. 600 is included: on a dark tinted panel a 600 shade
// lands around 3:1, under the 4.5:1 we want for body copy.
const DARK_TEXT = new RegExp(
  `\\btext-(?:(?:${PALETTES})-(?:600|700|800|900)|petal-(?:ink-soft|ink|muted))\\b`,
  'g'
);

/** `bg-amber-50/60` is written `.bg-amber-50\/60` in CSS — normalise back. */
const unescapeClass = (sel) => sel.replace(/\\(.)/g, '$1');

function collectSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function collectOverrides(css) {
  // Matches `.dark .bg-blue-50`, `.dark .bg-amber-50\/60`, `.dark   .text-red-700`.
  const covered = new Set();
  for (const m of css.matchAll(/\.dark\s+\.((?:[\w-]|\\.)+)/g)) {
    covered.add(unescapeClass(m[1]));
  }
  return covered;
}

const covered = collectOverrides(fs.readFileSync(CSS, 'utf8'));
const files = collectSourceFiles(SRC);

// class name -> Set of files that use it
const used = new Map();
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  for (const re of [LIGHT_BG, DARK_TEXT]) {
    re.lastIndex = 0;
    for (const m of code.matchAll(re)) {
      if (!used.has(m[0])) used.set(m[0], new Set());
      used.get(m[0]).add(path.relative(ROOT, file));
    }
  }
}

const missing = [...used.keys()].filter((cls) => !covered.has(cls)).sort();

if (missing.length > 0) {
  console.error(
    `✗ 工程師模式深色主題有 ${missing.length} 個 class 沒有覆蓋，開啟深色模式時會變成淺底淺字（或深底深字）：\n`
  );
  for (const cls of missing) {
    const where = [...used.get(cls)].sort();
    const shown = where.slice(0, 4).join(', ');
    const more = where.length > 4 ? ` …等 ${where.length} 個檔案` : '';
    console.error(`  ✗ ${cls}  ←  ${shown}${more}`);
  }
  console.error(
    `\n請到 src/index.css 的 Engineer Mode 區塊，替上面每個 class 加一條 .dark 覆蓋` +
      `\n（透明度變體要寫成跳脫形式，例如 .dark .bg-amber-50\\/60）。`
  );
  process.exit(1);
}

console.log(`✓ dark-mode contrast OK (${used.size} 個淺底/深字 class 都有 .dark 覆蓋)`);
process.exit(0);
