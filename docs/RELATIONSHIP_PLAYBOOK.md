# 關係解方手冊 Relationship Playbook

A public library of the cycles couples keep getting stuck in, each with the
same seven-step method. The product spec is PCS v1.0 (the 2026-11-06 request).
This file covers what engineering and content need to know.

## Funnel

Discover (public pages, SEO, shared links) → Apply (scripts, alternatives,
agreement; CTA into 說開一件事 or 替代方案協商) → Reflect Together (save +
private "我的經驗" notes, which need an account).

Nothing on the content side is gated. The first sign-up prompt appears only
after the reader has the full playbook (save, notes, "start a conversation").

## Where things live

| Piece | File |
|---|---|
| Content (繁中 / English) | `lib/playbooks/content.zh-TW.js`, `lib/playbooks/content.en.js` |
| Schema validation, list/detail helpers | `lib/playbooks/index.js` |
| SEO/OG + article HTML for `/playbooks`, `/playbooks/:slug`, sitemap entries | `lib/playbooks/render.js` (wired in `server.js`) |
| API | `routes/playbooks.js` (`/api/playbooks…`) |
| Private tables | `database/migrations/115_relationship_playbooks.sql` |
| UI | `src/components/playbooks/` |
| Guest mode | `src/guest/guestRoutes.ts` (saves + notes in the tab; content is `PUBLIC_GETS`) |
| Tests | `tests/playbooks.spec.ts` |

## API

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/playbooks` | public | summaries + categories, in the `X-Locale` language |
| GET | `/api/playbooks/:slug` | public | full playbook + `related`; 404 `PLAYBOOK_NOT_FOUND` |
| GET | `/api/playbooks/me` | JWT | `{ saved[], reflections[{slug,count,lastAt}] }` |
| PUT / DELETE | `/api/playbooks/:slug/save` | JWT | idempotent |
| GET / POST | `/api/playbooks/:slug/reflections` | JWT | owner-only; `REFLECTION_EMPTY`, `REFLECTION_TOO_LONG` (4000 chars), `REFLECTION_LIMIT` (100 per playbook) |
| DELETE | `/api/playbooks/reflections/:id` | JWT | owner-only; `REFLECTION_NOT_FOUND` |

Logs: `playbooks.library_viewed`, `playbooks.viewed`, `playbooks.saved`,
`playbooks.reflection_created`, `playbooks.page_view` (server-rendered page),
and so on. Client funnel events (R5, via `/api/track/view`):
`onboarding.playbooks.{library_viewed, card_opened, viewed, section_1..7,
script_copied_a|b, alternative_picked, agreement_copied, saved, shared,
reflection_started, reflection_completed, apply_clicked, save_gate,
reflection_gate, detail_signup_cta, library_signup_cta}[:<slug>]`.

## Adding or editing a playbook

1. Add the object to **both** content files with the same `slug`, the same
   array lengths and the same `alternativeSolutions[].id`s. Set `status:
   'published'` only once it has been reviewed; `draft` / `review` are never
   served.
2. Use the schema in `lib/playbooks/index.js` (`validatePlaybook`). `apply`
   is `'intimacy'` (opens 替代方案協商) or `'event'` (opens 說開一件事).
3. Run `npx playwright test tests/playbooks.spec.ts`. It checks the schema,
   the zh/en parity, gender-neutral copy (no lone 他/她, no he/she) and no em
   dashes.

No UI, route or sitemap change is needed: the library, detail page, SEO pages
and sitemap are all generated from the content.

## Content rules (PCS §7)

- No blame. Both partners' perspectives are fair; use A / B, never a gender.
- Consent: nobody owes sex, touch or affection as compensation for a no.
  Alternatives are invitations.
- Feelings are "possible", not diagnoses.
- Safety first: anything involving violence, coercion, intimidation or
  financial control gets a `safetyNotes` entry pointing to support instead of
  a negotiation exercise. Every page also shows the 113 / 1925 resources.
- Sensitive playbooks should be reviewed by a qualified relationship
  professional before publishing.

## Not built yet (PCS phases 3–4)

Shared playbook sessions with the partner, Luma-guided conversations seeded
from a playbook, shared agreements with progress tracking, follow-up
reflection reminders, contextual recommendations, and admin editing of
content (today an edit is a content-file change and a deploy).
