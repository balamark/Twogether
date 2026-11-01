# Project conventions

Notes for anyone (human or AI) working in this repo. Keep this file short and
current.

## Changelog & promo (every UI feature change)

When you ship a user-facing UI feature change:

1. **Add a changelog fragment file `changelog/YYYY-MM-DD-<slug>.md`** (today's
   date, short kebab-case slug, e.g. `changelog/2026-07-11-social-previews.md`)
   containing just the markdown bullet(s): `- **標題**: 說明…`. Keep it
   user-facing and concise — what changed and why it matters, not implementation
   detail. One new file per change; **never edit the generated changelog block
   in `README.md` by hand** — CI (`.github/workflows/changelog.yml`) recompiles
   it on merge to main. Preview locally with `npm run changelog`.
2. **Write a short thread/social post** promoting the feature (a few punchy lines,
   plain language, emoji ok) and give it to the user to share publicly. The thread
   post goes in the chat reply, not the repo (unless asked).

## Guest mode / 訪客模式 (every UI feature change)

Visitors without an account run the **real app** on a sample couple
(小安 ❤ 阿哲) — see `src/guest/`. While no `authToken` exists,
`guestAdapter` (wired into the axios client in `src/services/api.ts`) answers
every request from an in-browser mock backend whose data lives only in the
tab's `sessionStorage`. A feature that only works behind login can't attract
anyone, so when you add or change a feature:

- **New endpoint → add a guest route** in `src/guest/guestRoutes.ts` returning
  the same JSON shape the server does (unhandled routes fall back to an empty
  success, which usually renders an empty state — not good enough for a
  headline feature). AI endpoints answer from on-device heuristics
  (`guestSoften.ts`), except the core loop the guest preview is built
  around: 整理成三種版本 (icebreaker) and 請 AI 諮商師介入 (event_counselor)
  spend the guest's **5 real AI tries**, and the sample partner 阿哲 answers
  every guest message with a real AI reply (partner_reply: not counted, own
  cap). All go through the public `routes/guest-ai.js` (`src/guest/guestAi.ts`,
  `guestPartner.ts`; text is never stored, per-guest + per-IP + global caps)
  and fall back to the on-device demo when used up or unreachable.
  `GuestCoach.tsx` nudges partner reply → counselor → sign-up. Never send other
  guest data to the network.
- **Seed it**: add realistic sample rows to `src/guest/guestSeed.ts` (all
  copy via `tr()`, dates relative to now) and bump `buildSeed.VERSION` when the
  shape changes.
- Money, emailing real people, real counselors and uploads answer with
  `blocked()` (`GUEST_MODE` + a sign-up message), never a generic error.
- Never persist guest identity to `localStorage`; read the user id via
  `currentUserId()` (`src/guest/guestMode.ts`). Check `authState.isGuest` for
  account-only UI.
- Public read-only content (stories, counselor directory, testimonials) passes
  through to the real server — keep `PUBLIC_GETS` in sync with the server's
  unauthenticated routes.
- Run `tests/guest-mode.spec.ts`; it fails if a guest request leaks to the API.

`src/components/LoggedOutPreview.tsx` is now only the fallback for when guest
mode is off; keep its samples marked with `<SampleTag />`.

## Bilingual UI (繁中 / English)

The top-right switch flips the whole app between 繁中 and English. Every new
user-facing string must ship in both:

- **Frontend**: wrap it as `tr('繁中', 'English')` from `src/i18n/tr.ts`
  (shared header/menu chrome uses `t('key')` + `src/i18n/messages.ts`). Never
  wrap logic values (ids, enum/mood values stored in the DB, strings compared
  with `===`, AI prompt text). Switching language reloads the page, so
  module-level `tr()` constants are fine. Dates: `dateLocale()`.
- **Backend**: keep writing 繁中 in routes; add the English to
  `lib/i18n/serverMessages.en.json` (`exact`, or `patterns` with `{0}`…).
  `middleware/locale.js` translates whitelisted response keys when the client
  sends `X-Locale: en`, and AI replies follow the same language automatically.

## Image handling

**Never crop images.** Always show the full image.

- Use `object-contain` (not `object-cover`) on `<img>` elements and avoid
  fixed crops / background-image `cover`.
- It's fine to place a contained image inside a fixed-size slot (e.g.
  `aspect-video`); give the slot a neutral background (we use
  `bg-petal-cream-2`) so it shows behind images whose aspect ratio differs
  from the slot. The image is letterboxed/pillarboxed, never cut off.
- The shared `renderThumb` helper in `src/components/RoleplayView.tsx`
  defaults to `'contain'` for this reason — keep it that way.

## User-facing messages & logging (every new feature)

When you add or change a feature, update its messaging and logging in the same
change — don't ship the happy path alone.

- **Never show a vague, non-actionable message.** Every error the user can hit
  must say what happened AND what they can do next. Bad: "無法建立劇本".
  Good: "免費方案最多建立 3 個自訂劇本，升級 Premium 即可無限建立".
- **New limits/gates need their own message.** If you introduce a quota, paywall,
  permission, or validation rule, add a specific message + `error_code` for it
  and make the frontend surface that exact reason (don't let it collapse into a
  generic fallback). This was the bug behind the freemium quota: the cap was
  enforced but the user only saw a generic failure.
- **Preserve `error_code` end-to-end.** The axios response interceptor
  (`src/services/api.ts`) unwraps the body onto `error.message` / `error.data` /
  `error.error_code`; any error-normalizing helper must keep `error_code` (and
  the specific message) so the UI can branch on it.
- **Distinguish expected states from failures.** A reached quota / paywall is a
  `warning`/`info` with a next step, not a red `error` toast.
- **Add logging for the new path.** Log attempts and outcomes server-side via
  `lib/logger` (structured `logInfo`/`logWarn`/`logError`) so Cloud Logging shows
  the feature being used, not just when it errors.

## AI requests need the AI timeout (every AI-calling endpoint)

Any client call that triggers an LLM generation MUST pass `{ timeout: AI_TIMEOUT }`
in its axios config (`src/services/api.ts`). The default client timeout is only
15s, but LLM calls routinely take longer — omitting the timeout makes axios abort
a request the server is still (successfully) processing, and the interceptor
surfaces it as a false "連線逾時" (`TIMEOUT`) error. This is easy to miss on
**GET-based** AI endpoints, since the POST ones already set it. If you add or edit
a method that calls the LLM, grep the endpoint for `AI_TIMEOUT` and make sure it's
there. (This was the 產生話題建議 timeout bug: `getTherapyTopics` was a GET AI
call with no timeout override.)

## Schema changes go in migrations only

Every table, column and index is created by a numbered file in
`database/migrations/` (CI and deploy run `npm run migrate` first). Never add
runtime DDL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE`, an `ensure…Table()`
helper) to routes or services: it costs DB round trips on request paths, takes
table locks, and hides schema that the migrations never got — migration 105 had
to backfill four objects that only existed that way.

## UX conventions (every UI change)

Read `docs/UX_PLAYBOOK.md` before UI work — it holds the binding UX rules and
the decided product stances (merged conflict tabs, solo-mode before pairing,
FAQ+(?) help system, visible AI quota). Non-negotiables from it:

- **Empty states are mini-onboarding**: value line (for the relationship, not
  the feature) + primary CTA + sample. Never a bare "沒有資料" sentence.
- **Gates are three-part**: why blocked + what you CAN do + a CTA. Applies to
  unpaired, quota, and unverified states alike.
- **Max 6 main nav tabs**; new features go into existing tabs or the user menu.
  Tab names must pass the elevator test or carry a (?) hint.
- **Submit returns instantly** (playbook §R7): pressing a button hands control
  back to the user immediately; the network round-trip runs in the background.
  Default to **optimistic update** for reversible/low-stakes actions (toggles,
  reactions, mark-read, delete) — update local state first, roll back + notify on
  failure. Uploads/content-creation use a non-blocking upload that treats a
  timeout as "maybe succeeded" (never a red error that invites a duplicate).
  Only truly block when the result IS what the user is waiting for or money/auth
  is involved (login, pairing, payment, AI generation). Background failures always
  raise a notification; only interrupt for money, destructive, or auth decisions.
- **One blocking modal at a time**; priority order lives in the playbook §R4.
  Every modal needs a "稍後再說" that doesn't re-fire the same session.

## Page speed (every view / data-loading change)

Tab switches and 上一頁 must feel instant. Load view data through
`useCachedQuery` / `useCachedState` (`src/services/queryCache.ts`) so a revisit
paints from memory, show list images via `thumbSrc()` thumbnails, and check
`node scripts/perf/measure-pages.mjs --mobile` before/after. Budgets, logs
(`client.perf_*`, `slow_request`, `slow_query`) and queries live in
`docs/PERFORMANCE.md`.
