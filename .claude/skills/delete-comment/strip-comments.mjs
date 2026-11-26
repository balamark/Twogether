#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { Linter } from 'eslint'

const ROOT = process.cwd()
const { default: config } = await import(path.join(ROOT, 'eslint.comments.config.mjs'))
const linter = new Linter({ cwd: ROOT })
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const targets = args.filter((a) => !a.startsWith('--'))
if (targets.length === 0) {
  console.error('usage: node .claude/skills/delete-comment/strip-comments.mjs [--dry-run] <file|dir>...')
  process.exit(2)
}

const EXT = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/
const walk = (p) =>
  fs.statSync(p).isDirectory()
    ? fs.readdirSync(p).flatMap((n) => (n === 'node_modules' ? [] : walk(path.join(p, n))))
    : EXT.test(p) ? [p] : []

const offsetOf = (text) => {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return (line, column) => starts[line - 1] + column - 1
}

const jsxText = (raw) => {
  const parts = raw.split(/\r?\n/)
  if (parts.length === 1) return raw
  return parts
    .map((l, i) => (i === 0 ? l.trimEnd() : i === parts.length - 1 ? l.trimStart() : l.trim()))
    .filter(Boolean)
    .join(' ')
}

const lint = (text, filename) => {
  const messages = linter.verify(text, config, { filename })
  const fatal = messages.find((m) => m.fatal)
  if (fatal) throw new Error(`${filename}: ${fatal.message}`)
  const comments = messages.filter((m) => m.ruleId === 'local/no-comments')
  const at = offsetOf(text)
  const removed = comments.map((c) => [at(c.line, c.column), at(c.endLine, c.endColumn)])
  const tokens = []
  for (const t of linter.getSourceCode().ast.tokens) {
    if (removed.some(([s, e]) => t.range[0] >= s && t.range[1] <= e)) continue
    const prev = tokens[tokens.length - 1]
    if (t.type === 'JSXText' && prev && prev.type === 'JSXText') prev.value += t.value
    else tokens.push({ type: t.type, value: t.value })
  }
  const normalized = tokens
    .map((t) => (t.type === 'JSXText' ? { ...t, value: jsxText(t.value) } : t))
    .filter((t) => !(t.type === 'JSXText' && t.value === ''))
    .map((t) => `${t.type}:${t.value}`)
  return { comments, tokens: normalized }
}

function strip(text, comments) {
  const lines = text.split('\n')
  const starts = []
  let acc = 0
  for (const l of lines) { starts.push(acc); acc += l.length + 1 }
  const drop = new Set()
  const cuts = []
  for (const c of comments) {
    const l0 = c.line - 1, l1 = c.endLine - 1
    const s = starts[l0] + c.column - 1, e = starts[l1] + c.endColumn - 1
    const before = text.slice(starts[l0], s), after = text.slice(e, starts[l1] + lines[l1].length)
    if (!before.trim() && !after.trim()) { for (let l = l0; l <= l1; l++) drop.add(l) }
    else if (!after.trim()) cuts.push([s - (before.length - before.trimEnd().length), e])
    else cuts.push([s, e + (after.length - after.trimStart().length)])
  }
  const blank = (i) => i >= 0 && i < lines.length && !drop.has(i) && lines[i].trim() === ''
  const sorted = [...drop].sort((a, b) => a - b)
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    let b = a
    while (drop.has(b + 1)) b++
    i += b - a
    const prev = a - 1, next = b + 1
    const prevText = prev >= 0 ? lines[prev].trim() : ''
    const nextText = next < lines.length ? lines[next].trim() : ''
    if (blank(next) && (prev < 0 || blank(prev) || /[{([]$/.test(prevText))) drop.add(next)
    else if (blank(prev) && /^[})\]]/.test(nextText)) drop.add(prev)
  }
  let out = text
  for (const [s, e] of cuts.sort((x, y) => y[0] - x[0])) out = out.slice(0, s) + out.slice(e)
  const outLines = out.split('\n')
  return outLines.filter((_, i) => !drop.has(i)).join('\n')
}

let files = 0, removed = 0, linesBefore = 0, linesAfter = 0, failed = 0
for (const file of targets.flatMap(walk)) {
  const rel = path.relative(ROOT, path.resolve(file))
  const text = fs.readFileSync(rel, 'utf8')
  const before = lint(text, rel)
  if (before.comments.length === 0) continue
  if (before.comments.some((c, i) => i && c.line <= before.comments[i - 1].endLine && c.line === before.comments[i - 1].line && c.column < before.comments[i - 1].endColumn)) throw new Error(`${rel}: overlapping comments`)
  const out = strip(text, before.comments)
  const after = lint(out, rel)
  const same = after.comments.length === 0 && after.tokens.length === before.tokens.length && after.tokens.every((t, i) => t === before.tokens[i])
  if (!same) { failed++; console.error(`SKIP ${rel}: code tokens changed or comments remain`); continue }
  files++; removed += before.comments.length
  const lb = text.split('\n').length, la = out.split('\n').length
  linesBefore += lb; linesAfter += la
  console.log(`${rel}: -${before.comments.length} comments, -${lb - la} lines`)
  if (!dryRun) fs.writeFileSync(rel, out)
}
console.log(`\n${dryRun ? '[dry run] ' : ''}${files} files, ${removed} comments, ${linesBefore - linesAfter} lines removed${failed ? `, ${failed} skipped` : ''}`)
process.exit(failed ? 1 : 0)
