---
name: delete-comment
description: Clear code comments out of a slice of the codebase under ADR 0001. Classify each comment as tautology, stale, excuse or decision record; delete tautologies and stale ones, file a GitHub issue for each excuse, move decision records into docs/adr, then strip the comments and tighten the comment-lint ratchet. Use when asked to "delete comments", "run /delete-comment", or to clean comments in a directory or file.
---

# /delete-comment

Clears comments from one **slice** (a directory or a list of files) and tightens
the ratchet in `comment-suppressions.json`. The policy is
`docs/adr/0001-no-code-comments.md`.

Arguments: the slice, e.g. `/delete-comment services/` or
`/delete-comment src/guest src/services/api.ts`. With no argument, pick the next
slice from the largest remaining baselined directories (step 0) and ask the user
to confirm it.

## 0. Size the slice

```bash
node -e 'const s=require("./comment-suppressions.json");const d={};for(const f in s){const k=f.split("/").slice(0,2).join("/");d[k]=(d[k]||0)+s[f]["local/no-comments"].count}console.log(Object.entries(d).sort((a,b)=>b[1]-a[1]).slice(0,15))'
node .claude/skills/delete-comment/strip-comments.mjs --dry-run <slice>
```

Keep a slice to roughly ≤300 comment blocks, so every comment really gets read.

## 1. Read every comment in context and classify it

Read the files themselves, not a grep listing. Classify each comment block
(consecutive `//` lines count as one block):

| Category | Test | Action |
|---|---|---|
| **Tautology** | Restates what the next lines plainly do (`// Update love moment`, `// Bearer TOKEN`, JSDoc that repeats the signature) | Delete |
| **Stale** | Refers to code, files, line numbers, functions or behaviour that no longer exist or have changed. **Verify** with grep before you call it accurate | Delete |
| **Excuse** | Justifies a shortcut: "keep in sync with …", "mirror of …", "table may not exist yet", test-only branches, "defensive fallback", "TODO/HACK/for now" | Delete **and** file an issue for the shortcut |
| **Decision record** | A non-obvious *why*: a product rule, vendor quirk, security/privacy stance, failure-mode choice (fail-open, idempotency), or a number with a rationale | Move into an ADR, then delete |

One comment can be mixed (a decision plus a stale ref, or a decision plus an
excuse). Record the decision without the stale part, and file the excuse.

Tool directives are **not** comments and stay: `eslint-disable…`, `@ts-expect-error`,
`@ts-ignore`, `/// <reference>`, `#__PURE__`, `@vite-ignore`, `webpackChunkName`,
shebangs. The lint rule already ignores them.

## 2. Excuses → GitHub issues

First list the open issues, to avoid duplicates. Group excuses by root cause
(one issue per kind of shortcut, not one per comment). Each issue has: where it
is (file + function), what the comment claimed, what breaks, and a concrete fix.
Open it with "Found during the comment cleanup (ADR 0001)", and end it with the
repo's Claude Code footer.

## 3. Decision records → ADRs

- Add to the existing ADR for that module if `docs/adr/README.md` maps it to
  one. Otherwise create `docs/adr/NNNN-<slug>.md` (next number) with
  `Status`, `Covers: <modules>` and short `Decisions` bullets.
- Write the *why*, not the code. Check every number, env var name and path
  against the current code before writing it down.
- Reference the issue number where a decision lives alongside a known shortcut.
- Add or update the row in `docs/adr/README.md`.

## 4. Strip the comments

```bash
node .claude/skills/delete-comment/strip-comments.mjs <slice>
```

The script removes every non-directive comment, collapses the blank lines that
leaves behind, and **refuses to write a file** whose code tokens change (JSX
whitespace is compared by JSX rules). If it prints `SKIP`, fix that file by hand.

Then confirm the code still works:

```bash
for f in $(git diff --name-only -- <slice> | grep -E '\.c?js$'); do node --check "$f"; done
npm run build            # when the slice touches src/
```

Run the specs that cover the slice when Postgres is available
(`npx playwright test <spec>`); otherwise CI does.

## 5. Tighten the ratchet

```bash
npm run lint:comments:prune   # shrinks comment-suppressions.json to the new counts
npm run lint:comments         # must exit 0
```

`npm run lint:comments` fails both when a file gains a comment and when the
baseline still lists comments that are gone. The baseline can only shrink.
**Never** use `--suppress-all` or `--suppress-rule` to grow it.

## 6. Report

In the PR description, put a table of counts per category for the slice, the
issues filed, the ADRs added or updated, and lines removed. Also give the
remaining baseline total from:

```bash
node -e 'const s=require("./comment-suppressions.json");let n=0;for(const f in s)n+=s[f]["local/no-comments"].count;console.log(n)'
```
