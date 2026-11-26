#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const CSS = path.join(SRC, 'index.css');

const PALETTES = [
  'gray', 'slate', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
  'primary', 'romantic', 'lavender', 'love',
].join('|');

const LIGHT_BG = new RegExp(
  `\\bbg-(?:(?:(?:${PALETTES})-(?:50|100|200)|white|petal-(?:cream-2|cream|rose-soft|rule|muted))(?:\\/\\d+)?` +
    `|petal-(?:sage|rose)\\/(?:[1-9]|[1-3]\\d))\\b`,
  'g'
);

const DARK_TEXT = new RegExp(
  `\\btext-(?:(?:${PALETTES})-(?:600|700|800|900)|petal-(?:ink-soft|ink|muted))\\b`,
  'g'
);

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
  const covered = new Set();
  for (const m of css.matchAll(/\.dark\s+\.((?:[\w-]|\\.)+)/g)) {
    covered.add(unescapeClass(m[1]));
  }
  return covered;
}

const covered = collectOverrides(fs.readFileSync(CSS, 'utf8'));
const files = collectSourceFiles(SRC);

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
