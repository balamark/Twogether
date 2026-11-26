# 0003. Application-level authorization & privacy

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/eventAccess.js`, `lib/deepDiveAccess.js`, `lib/conflictMediator.js` (`serialize…`)

## Context

The tables have RLS enabled with **zero policies** (migrations 087/110). The
backend connects as `postgres`, so the database enforces nothing per user.
All authorization is application code.

## Decisions

- **One gate per domain.** `assertEventAccess` (事件) and `assertJourneyAccess`
  (情緒深潛) are the only gates their endpoints may use. They live in `lib/`,
  so sibling routers (event closure, playbooks, follow-ups) can authorize a
  request without requiring the big router.
- **Missing and forbidden collapse into one 404**, so an outsider can't probe
  for ids.
- **A "couple" means a real pairing**: `user2_id IS NOT NULL`. A half-created
  invite row is not a couple.
- **Deep Dive privacy (PRD §30).** The 給過去的信 / 自我安撫的信 letters
  (`kind` `past` / `compassion`) belong to the owner's own history and never
  reach the partner. Only the `partner` letter is shareable, and only once its
  visibility is `shared`. The partner relationship to a journey exists only
  after the journey is shared. `serializeJourney` re-checks by viewer role, as a
  second, authoritative gate, whatever rows the route loaded. The partner never
  sees the raw exploration `state`.
- **Sophie held messages.** The recipient sees `original_text` only once the
  message is `RELEASED`/`DELIVERED`. Before that, only the sender sees it. A
  released message carries its translation and need, so the partner sees the
  original and the underlying need together, whatever the 情緒翻譯 lens toggle
  says.
- **An absent field is not a false one.** `closure_pending_me` is computed only
  by the list query. Other callers leave the key out instead of emitting `false`,
  because the 輪到你了 chip would act on a false `false`.
- **Validation errors carry an `error_code`** and prefer the validator's own
  `.withMessage()` text. This lets the UI render expected states (such as a
  too-short commitment) as a `warning` with a next step, not a generic error.
  (The duplicated helpers are tracked in #170.)
