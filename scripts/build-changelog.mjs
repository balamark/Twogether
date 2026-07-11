#!/usr/bin/env node
// Compiles changelog fragments into README.md.
//
// Each user-facing change ships as its own file `changelog/YYYY-MM-DD-<slug>.md`
// containing just the markdown bullet(s) for that change — one new file per PR,
// so concurrent PRs never conflict. This script groups the fragments by the
// date in the filename (newest first; same-date fragments merge under one
// heading, ordered by filename) and rewrites the block between the
// `changelog:begin` / `changelog:end` markers in README.md.
//
//   npm run changelog        (or: node scripts/build-changelog.mjs)
//
// CI (.github/workflows/changelog.yml) runs this on every push to main that
// touches changelog/**, and commits the regenerated README. Keep this script
// dependency-free (node stdlib only) — CI runs it without npm ci.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fragmentsDir = path.join(root, 'changelog');
const readmePath = path.join(root, 'README.md');

const BEGIN = '<!-- changelog:begin (generated from changelog/*.md — edit those, not this) -->';
const END = '<!-- changelog:end -->';
const NAME_RE = /^(\d{4}-\d{2}-\d{2})-[a-z0-9][a-z0-9-]*\.md$/;

const names = (await readdir(fragmentsDir)).filter((n) => n.endsWith('.md')).sort();
const bad = names.filter((n) => !NAME_RE.test(n));
if (bad.length) {
  console.error(
    `Bad fragment filename(s): ${bad.join(', ')}\n` +
    'Expected changelog/YYYY-MM-DD-<slug>.md (lowercase slug, e.g. 2026-07-11-social-previews.md)'
  );
  process.exit(1);
}
if (!names.length) {
  console.error(`No fragments found in ${fragmentsDir}`);
  process.exit(1);
}

// Group by date; within a date keep filename order (already sorted).
const byDate = new Map();
for (const name of names) {
  const date = name.match(NAME_RE)[1];
  const body = (await readFile(path.join(fragmentsDir, name), 'utf8')).trim();
  if (!body) {
    console.error(`Empty fragment: changelog/${name}`);
    process.exit(1);
  }
  if (!byDate.has(date)) byDate.set(date, []);
  byDate.get(date).push(body);
}

const sections = [...byDate.keys()]
  .sort()
  .reverse()
  .map((date) => `### ${date}\n${byDate.get(date).join('\n')}`);

const readme = await readFile(readmePath, 'utf8');
const beginAt = readme.indexOf(BEGIN);
const endAt = readme.indexOf(END);
if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
  console.error(`README.md is missing the ${beginAt === -1 ? 'begin' : 'end'} changelog marker`);
  process.exit(1);
}

const updated =
  readme.slice(0, beginAt + BEGIN.length) +
  '\n' + sections.join('\n\n') + '\n' +
  readme.slice(endAt);

if (updated === readme) {
  console.log(`README.md changelog already up to date (${names.length} fragments, ${byDate.size} dates)`);
} else {
  await writeFile(readmePath, updated);
  console.log(`README.md changelog rebuilt from ${names.length} fragments (${byDate.size} dates)`);
}
