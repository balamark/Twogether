# 0004. Server-side English via response translation

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `middleware/locale.js`, `lib/i18n/serverMessages.en.json`

## Decision

Route handlers keep writing user-facing text in 繁中. When the client sends
`X-Locale: en`, the middleware rewrites the strings on the way out from one
dictionary, so no route has to change.

- **Only whitelisted keys are translated** (`message`, `error`, `title`, …).
  Stored values (mood tags, ids, user-written text) are either never under those
  keys or never match an entry exactly, so data round-trips unchanged. Strings the
  dictionary doesn't know (AI text, for example) pass through untouched.
- `item_label` is whitelisted: only billing responses carry it, and its values
  come from our own catalog (`lib/receipts.js`), never from user input.
- **Pattern entries translate their captured groups too**, because a capture
  can itself be a dictionary phrase (a verb, a plan label).
- **Arrays inherit the parent key**, so `styles: ['溫暖', …]` and `errors: [{ msg }]` work.
- **The locale goes into the request context**, so the LLM provider answers in
  the same language without the locale being passed through every call.
