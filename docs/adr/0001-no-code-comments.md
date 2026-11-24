# 0001. No code comments; decisions live in ADRs

- Status: accepted (2026-11-24)

## Context

The JS/TS codebase had ~10,250 comment-only lines in ~4,850 blocks. Sampling them
showed four kinds:

- **Tautology**: restates the code (`// Update love moment`, `// Bearer TOKEN`).
- **Stale**: points at code that has moved or no longer exists
  (`routes/coins.js:19`, `countTodayIcebreakerUsage`, "the long note at the
  upload call site").
- **Excuse**: justifies a shortcut ("keep in sync with …", "table may not
  exist yet", test-only branches). The comment lets the shortcut stick around
  and get copied.
- **Decision record**: a real, non-obvious *why*. These are valuable, but buried
  in a file that nobody reads at decision time.

## Decision

1. New code carries no comments. `npm run lint:comments`
   (`eslint.comments.config.js` + `eslint-rules/no-comments.js`) reports every
   comment except tool directives (`eslint-*`, `@ts-*`, `/// <reference>`,
   `#__PURE__`, `@vite-ignore`, `webpackChunkName`).
2. **Ratchet:** existing comments are frozen in `comment-suppressions.json`
   (ESLint bulk suppressions). A file may not gain comments. When comments are
   removed, the baseline must be pruned (`npm run lint:comments:prune`), or the
   check fails. The count only goes down.
3. Cleanup is done slice by slice with the `/delete-comment` skill
   (`.claude/skills/delete-comment/`):
   - delete tautologies and stale comments;
   - delete excuses and file an issue for the shortcut they covered;
   - move decision records into an ADR in this folder.
4. If you need to explain something, prefer this order: a better name → a
   smaller function → a test that pins the behaviour → an ADR.

## Consequences

- Readers lose the inline *why*. `docs/adr/README.md` maps modules to ADRs, so
  look there first.
- First slice (this change): `middleware/` + `lib/`, 255 blocks, broken down as:
  - 123 tautology
  - 2 stale
  - 14 excuse → issues #169–#173
  - 116 decision record (+3 mixed) → ADRs 0002–0017
  - 1 directive kept
- Not covered by the rule: SQL migrations (~1,370 comment lines, part of the
  applied schema history), shell, CSS, HTML and YAML.
