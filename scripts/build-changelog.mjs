#!/usr/bin/env node

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
