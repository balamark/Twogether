# Handoff — 一起收尾 review fixes + 好好說話 nav cleanup

Source plan: `~/.claude/plans/give-a-code-review-velvety-pearl.md`. That file is
the authority on *what* each fix is; this file tracks *how far along* it is.

Follows `docs/HANDOFF_EVENT_CLOSURE.md` (which is now stale — it says "frontend
not started", but `119c35a` shipped it).

**Legend**: ✅ done · 🔄 in progress · ⬜ not started

**Last updated**: 2026-08-08 — Parts 1, 2 and 3 are complete. `npm run build`
(`tsc -b`) is green, `events-closure-api.spec.ts` is 10/10, the regression set
is 17/17, and the three new UI specs (9 cases) pass. What remains is the manual
390px pass, the promo post, and the commit.

---

## Part 1 — Correctness

| # | Item | Status | Notes |
|---|---|---|---|
| 1.1 | reopen → 一起收尾 dead end (`ON CONFLICT DO UPDATE`) | ✅ | `enterClosing`, guarded by `WHERE status <> 'collecting'` so the idempotent re-tap keeps its deadline. **Uncommitted.** |
| 1.2 | 取消收尾 destroys therapy note | ✅ | backend `POST /:id/closure/abandon` + `ClosurePanel.handleCancel` now calls `apiService.abandonClosure`, never `reopenEvent` |
| 1.3 | shared decision never reviewable (`'proposed'` vs `'pending_review'`) | ✅ | `SharedDecisionStatus` type; both gates compare `'proposed'` |
| 1.4 | `我想調整一下` on decision has no note box | ✅ | `reviewNote(target)` helper renders in both sections; `submitReview` compares `showNoteFor !== target` |
| 1.5 | `再試一次` blanks the summary card | ✅ | route returns the serialized closure; `EventDetail` guards against a blank |
| 1.6 | 72h sweep can't rescue both-submitted-neither-reviewed | ✅ | `{ force: true }` in the sweep; spec'd |
| 1.7 | `reviewed_at` set without reviewing | ✅ | decision branch now checks rowcount → 400 `CLOSURE_NOT_STARTED` |
| 1.8 | re-submit doesn't re-open partner's review | ✅ | reads `priorText`, clears partner `reviewed_at` only on a real edit |
| 1.9 | double notification on finalize | ✅ | dropped the `event_resolved` call |

## Part 2 — UX, copy, friction

| # | Item | Status | Notes |
|---|---|---|---|
| 2.1 | `跳過` becomes a dead button | ✅ | `skipSuppressed` deleted entirely — nothing auto-opens this modal |
| 2.2 | no way to revise your own commitment | ✅ | `revising` state in the panel; 改一下我的約定 on both the waiting and review cards; composer footer swaps to 不改了 / 更新我的約定 |
| 2.3 | `COMMITMENT_TOO_SHORT` never emitted | ✅ | `sendValidationError(req, res, errorCode)`; submit passes it, client warning branch is now reachable |
| 2.4 | both-skipped renders a broken summary | ✅ | early return, one line, no retry button |
| 2.5 | partner's feedback on *my* commitment invisible | ✅ | `reviewNote` passed for both commitments |
| 2.6 | garbled waiting copy + stale `now` | ✅ | 若…都還沒動作 rewrite + `setInterval(60_000)` so the grace boundary lands without a refocus |
| 2.7 | smaller copy / affordance fixes (5 sub-items) | ✅ | min-char hint, 我先跳過 → 改一下我的約定, decision `AiQuotaHint` + testid, finalize toast title branches on code, `CLOSURE_NOT_STARTED` |
| 2.8 | list never says whose turn it is | ✅ | `closure_pending_me` on the list query → `closurePendingMe` → 輪到你了 chip |
| 2.9 | filtering history to empty status traps you | ✅ | `filterChips` stays mounted; filter-specific empty state + 看全部 |
| 2.10 | redundant refetch + duplicate testids | ✅ | panel refetch keyed on `eventId` via a ref (robust to any parent identity); one testid per screen |
| 2.11 | type drift + dead code in `api.ts` | ✅ | `CommitmentStatus` matches the CHECK; `cancelClosure` → `void`; `created` from 201; dead resolve methods deleted |
| 2.12 | sweep unthrottled | ✅ | module-level `lastSweepAt`, 5 min/process, disabled under test |

## Part 3 — 好好說話 navigation

| # | Item | Status | Notes |
|---|---|---|---|
| 3.1 | titles adopt sub-tab names (說開一件事 / 接住情緒) | ✅ | both headers + `engineerLexicon` keys + `LoggedOutPreview` eyebrow; the unauth EventsView fallback too |
| 3.2 | collapse EventsView's tab row | ✅ | 開始對話 in the list header, 分析 as an icon-button with `events-analytics-back` |
| 3.3 | one sticky row, not two | ✅ | `App.tsx` sub-tab row is `sticky top-0 z-30`; ConflictView's section nav moved to `top-[52px] z-20` so they stack |
| 3.4 | one type system (editorial header in EventsView) | ✅ | eyebrow + `font-display` + italic sub-line, same markup as ConflictView |
| 3.5 | cross-view CTA lands on the composer | ✅ | `pendingEventsCompose` in App → `initialSubView` (consume-once); `onComposeEvent` on ConflictView, falls back to `onNavigate('events')` |

## Ship obligations

| Item | Status |
|---|---|
| `changelog/2026-08-08-closure-fixes.md` | ✅ 4 bullets, `npm run changelog` recompiles cleanly |
| `LoggedOutPreview` header mirror (only if 3.4 changes it) | ✅ conflict eyebrow → 接住情緒 |
| `[closure]` frontend log for abandon + `events.closure.abandon` backend | ✅ both; plus `[conflict]` log on the new CTA |
| Promo thread post (chat reply, not repo) | ⬜ |

## Verification

| Step | Status |
|---|---|
| `events-closure-api.spec.ts` stays green + 3 new cases (1.1/1.2/1.6) | ✅ 10/10 |
| Regression suite (reply, detail-edit, therapy-note, acceptance, resolve-privacy, compose-edit) | ✅ 17/17 |
| 3 new specs: `events-closure`, `-escape`, `-quota` | ✅ 9/9, on `tests/helpers/closure.ts` |
| `communicate-nav.spec.ts` for Part 3 | ✅ 3/3 |
| `npm run build` (`tsc -b`) | ✅ |
| Full `npm run test:e2e` | ✅ 162 passed. The 13 failures are environmental: 12 Mobile Safari cases can't launch (webkit binary missing — `npx playwright install`), and `line-notifications` flaked in the serial run but passes on its own. |
| Manual 390px pass | ⬜ user-side |
| `npm run changelog` preview | ✅ |

---

## Things that will bite you

Everything in `docs/HANDOFF_EVENT_CLOSURE.md` §"Things that will bite you" still
applies (mount order, no `require('./events')` from the closure router, port 8080
must be free, `closing` never sets `resolved_at`). Additionally:

- **`SWEEP_MIN_INTERVAL_MS` is 0 under `NODE_ENV=test`.** The throttle would
  otherwise make sweep assertions depend on which earlier test in the serial run
  happened to warm it.
- **A 429 on 幫我想一個 navigates you OUT of the ceremony.** Any freemium cap
  code (`AI_DAILY_LIMIT_REACHED`) makes the api interceptor dispatch
  `billing:limit-reached`, and `App.tsx:1273` answers it with
  `setCurrentView('upgrade')` — app-wide, not closure-specific. So the warning
  toast fires *and* the paywall replaces the composer, losing the typed draft.
  `events-closure-quota.spec.ts` asserts this because it is what happens; the
  plan assumed the composer stayed. Changing it means exempting some callers
  from the global dispatch — a product decision, not a bug fix.
- **`abandon` vs `cancel` vs `reopen` are three different intents.** `cancel`
  deletes the closure row before anyone writes; `abandon` marks it `abandoned`
  and drops only `draft` commitments; `reopen` is the event-level action that
  nulls `therapy_note`. Never wire a 取消收尾 button at `reopen` again — that was
  bug 1.2.
