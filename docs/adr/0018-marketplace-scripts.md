# 0018. Marketplace scripts: adult classification & bot import

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/adultScripts.js`, `lib/marketplaceBotScript.js`, `middleware/botAuth.js` (auth: [0002](0002-authentication-and-sessions.md)), docs/MARKETPLACE_BOT_API.md

## Which scripts are 18+

There is no intensity column. The marketplace bot always adds the tag `18+`
(even for mild scripts) plus `強度:<label>`, and the in-app uploader stores the
same tags array. A script is adult when its tags contain `18+`, `強度:露骨` or
`強度:激烈`. Mild and moderate (`強度:清淡`, `強度:中等`) stay visible. The JS
check and the SQL predicate share one tag list.

## Bot import

- **A bot upload becomes the same `custom_scripts` row an in-app upload
  writes.** The table has no columns for acts, named roles, intensity or
  safeword notes. They are rendered into `content` (and a few tags) in the line
  shape the player already understands, so there's no schema change and no
  second player.
- **Genre fallback:** when the caller omits genre, explicit/intense map to 大膽,
  the marketplace's closest thing to an adult category.
- **Role tokens:** `[男]`/`[女]` are used only when the two roles are one man and
  one woman, the only case the player can map onto a couple's nicknames.
  Anything else (missing, same gender, unspecified) uses
  `[partner1]`/`[partner2]`, which work for every couple.
- **Author:** a real `users.id` from the env wins. Unset, blank, the string
  `"null"` (what App Engine stores for an empty `app.yaml` value) or an
  unsubstituted `$_MARKETPLACE_BOT_AUTHOR_ID` are ignored, so the lookup by the
  official account's email (`DEFAULT_BOT_AUTHOR_EMAIL`) runs instead.
- **Re-uploads are idempotent:** an identical row (tags compared in stored
  order) is not rewritten.
