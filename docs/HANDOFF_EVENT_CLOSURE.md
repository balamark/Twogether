# Handoff — 一起收尾 (Event Closure), Batch 1

**Status: backend done and green. Frontend not started.**

Source plan: `~/.claude/plans/flow-starry-frog.md` (§1.1–1.10). This file is the
working breakdown; the plan is still the authority on copy, wireframes and the
Batch 2/3 follow-ups. If they disagree, the plan wins — except where noted under
"Deviations from the plan" below.

## What this change is

After a couple finishes discussing a conflict, **either** partner taps 一起收尾.
The event moves to a new `closing` status. Each person writes one small
commitment (「下次我願意做的一件小事」) plus an optional shared decision (共同決定),
then reviews what the other wrote. When both are terminal the event resolves,
both commitments go `active` with a 72h follow-up clock, and the AI writes a
short 見解 **after** the resolution has already been claimed.

The old two-step 標記為解決 → 確認解決 handshake is gone. `resolve_pending` rows
still exist in production, so everything treats them exactly like `open`.

---

## Done (verified)

| Area | Files | Proof |
|---|---|---|
| Migration + status union | `database/migrations/083_event_closure_and_commitments.sql`, `src/services/api.ts` `EventStatus` | applied to local test DB; `event_closures`, `event_closure_participants`, `commitments` exist |
| §1.8 breakage inventory | `routes/events.js`, `routes/relationship.js` | every row of the plan's table applied; see `grep -n "'closing'" routes/events.js` |
| Lib extraction | `lib/eventAccess.js` (114), `lib/eventNotify.js` (105) | pure move — 8 existing event specs pass with **zero spec edits** |
| Closure AI | `lib/closureAi.js` (60), `services/llm/claudeProvider.js`, `services/llm/mockProvider.js`, `services/llmService.js`, `lib/aiUsage.js` | shared shapers so claude/mock can't drift; both kinds added to `BILLABLE_KINDS` on the shared `icebreaker_per_day` budget |
| Closure router | `routes/event-closure.js` (987), mounted in `server.js` **before** `eventRoutes` | `tests/events-closure-api.spec.ts` — 7/7 pass |
| Notification registries | `lib/eventNotify.js` `EVENT_PUSH_EMOJI`, `services/emailService.js` `meta`, `src/components/NotificationInbox.tsx` | all three registries carry `event_closing_started` 🤝 / `event_closure_partner_ready` 📝 / `event_closure_done` 🌱 |
| Logging | `routes/event-closure.js` | `events.closure.{start,assist,submit,review,skip,cancel,finalize,auto_finalize,insight,insight_deferred,finalized}` + `events.commitment.created`, all `logInfo`/`logWarn` |
| `EventDetail` status pill | `src/components/EventDetail.tsx:69` | `closing` → 🌱 收尾中; `open`/`resolve_pending` share the 未解決 pill |
| `EventHistoryList` cleanup | `src/components/EventHistoryList.tsx` | dead `filterStatus` prop (zero callers) deleted along with its no-op `visibleEvents` memo |

All 9 endpoints are live under `/api/events/:id/closure*`: `start`, `GET`,
`assist`, `submit`, `review`, `skip`, `cancel`, `finalize`, `insight`.

### Commands that currently pass

```bash
npx playwright test tests/events-closure-api.spec.ts          # 7/7
npx playwright test tests/events-reply.spec.ts \
  tests/events-therapy-note.spec.ts \
  tests/events-detail-edit.spec.ts tests/events-acceptance.spec.ts   # 8/8, no regressions
npm run lint    # baseline only: 4 errors / 2 warnings, all pre-existing in AchievementsView.tsx
```

---

## Not done — pick up here

### 1. Frontend components (`src/components/closure/`, none exist yet)

Plan §1.7 lists ten files. Suggested order — each one is independently
compilable and the panel is the only one with real logic:

| File | Screen | Note |
|---|---|---|
| `CloseTogetherBar.tsx` | 0 | always-present bar on `open`/`resolve_pending` |
| `CloseTogetherModal.tsx` | 1 | confirm sheet |
| `ClosurePanel.tsx` | orchestrator | fetches `GET /closure`, owns all state, picks screen 2/4/5. Polls on focus/visibilitychange only — **no interval, no websocket** |
| `CommitmentComposer.tsx` | 2 ① ② | textarea + ✓/✗ examples + 幫我想一個 + `AiQuotaHint` |
| `AssistOptions.tsx` | 2a | |
| `ClosureSkipModal.tsx` | 3 | |
| `ClosureWaitingCard.tsx` | 4 | shows `canFinalizeAt` — naming the auto-finalize time is what turns limbo into a wait |
| `PartnerReviewCard.tsx` | 5 | |
| `ClosureSummaryCard.tsx` | 6 | sibling of `TherapyNoteCard`, same shell styling |
| `CommitmentCard.tsx` | shared row | reused by Batches 2–3 — keep it dumb |

`GET /closure` already returns everything the panel needs (`me`, `partner`,
`canFinalizeAt`, `deadlineAt`, `therapyNote` for the recap, `insight`), so the
panel should need exactly one fetch to render any screen.

### 2. `src/services/api.ts`

Only the `EventStatus` union is done. Still needed: the `EventClosure` /
`Commitment` types mirroring `serializeClosure()` in
`routes/event-closure.js:153`, plus the nine `apiService` methods. Keep
`error_code` intact through the interceptor (CLAUDE.md) — the UI branches on
`AI_DAILY_LIMIT_REACHED`, `CLOSURE_NEEDS_YOUR_PART`, `CLOSURE_FINALIZE_TOO_EARLY`,
`CLOSURE_ALREADY_STARTED`, `COMMITMENT_TOO_SHORT`.

### 3. `EventDetail.tsx` diff (~40 lines, no new `useState` beyond one boolean)

Exactly as plan §1.7:

- `canFacilitate = canSendMessage && event.status !== 'closing'` — replies stay
  open during 收尾, only the guided session pauses (backend already returns
  `EVENT_CLOSING` at `routes/events.js:2160`).
- Render `<CloseTogetherBar>` on `open`/`resolve_pending`, `<ClosurePanel>` on
  `closing`, `<ClosureSummaryCard>` inside the resolved block above
  `TherapyNoteCard`.
- **Delete `ResolveControls`** — the definition at `EventDetail.tsx:1412` and
  its render site at `:1355`. Both are still present.

### 4. Remaining specs (plan §1.9)

- `tests/events-closure.spec.ts` — mocked happy path across screens. Must assert
  the partner's commitment is **not in the DOM** before I submit (the reveal rule
  is server-side, but a regression that leaks it into props should fail loudly).
- `tests/events-closure-escape.spec.ts` — skip/cancel/finalize. `closure-skip-later`
  must not re-open the modal in the same session (UX playbook R4); cancel hidden
  once the partner has submitted; `canFinalizeAt` in the past → finalize works.
- `tests/events-closure-quota.spec.ts` — `closure/assist` stubbed 429
  `AI_DAILY_LIMIT_REACHED` renders as a `warning`, not a red error; textarea
  still editable; submit still works; and `closure/start` still succeeds with an
  exhausted quota. This is the spec that encodes "entering 收尾 is never gated by
  AI budget."

All three: Mobile Chrome only, `data-testid` locators, scaffold from
`tests/events-reply.spec.ts` with a seeded `authState` that **includes
`selected_therapist`**. The full `data-testid` list is plan §1.7.

### 5. Ship obligations

- `changelog/2026-08-XX-event-closure.md` fragment (never hand-edit README's
  generated block; preview with `npm run changelog`).
- Extend `PREVIEWS.events` in `src/components/LoggedOutPreview.tsx` with a
  closure step + `<SampleTag />` — static, `object-contain`.
- Frontend `[closure]` console logs (backend logging is already complete).
- Promo thread post in the chat reply.
- Manual pass per plan §1.9: 390px, Screens 0–7, LINE + email rendering of the
  three new notification types, and the 關係之屋 openConflicts number mid-closing.

---

## Things that will bite you

- **Never `require('./events')` from `routes/event-closure.js`.** The dependency
  runs one direction only (events → closure). The reverse is the require cycle
  the plan warns about.
- **`server.js` mount order matters**: `eventClosureRoutes` is mounted on
  `/api/events` *before* `eventRoutes`, otherwise `/:id/closure/*` gets swallowed
  by an events route.
- **`closing` never sets `resolved_at`.** Every metric keyed on `resolved_at`
  must stay honest while the couple is still writing. The API spec asserts this.
- **The insight is written after the finalize claim**, never before — a failed or
  quota-blocked LLM call can't strand an event in `closing`. Failures log
  `events.closure.insight_deferred {reason}` and the summary card is supposed to
  offer a manual retry via `POST /closure/insight` (frontend side not built yet).
- **Port 8080 must be free of any non-test server** before running Playwright, or
  the guard aborts with `dbIsLocal=false`. Load routers with
  `node -e "require('./routes/event-closure.js')"` — never `require('./server.js')`,
  which binds the port against whatever `.env` points at.
- `migrations` table does not exist in the local test DB; `setup-test-db.js` /
  `scripts/migrate.js` is how 083 got there. Don't assume the ledger.

## Deviations from the plan

**Finalize condition.** Plan §1.2 prose says a closure finalizes "when every
participant is terminal — terminal meaning they have (a) submitted their own
commitment *and* reviewed their partner's, or (b) skipped, or (c) been
auto-skipped", but the SQL printed right underneath it only checks
`p.status = 'pending'`. Those disagree: the SQL resolves the event the instant
the second person submits, before anyone has reviewed anything, which makes
Screen 5 unreachable. The prose is implemented; the printed SQL is not.

`NOT_TERMINAL_EXISTS` in `routes/event-closure.js:289` also makes the review
clause conditional on the partner having actually submitted — if they skipped
there is nothing to review, and a blanket `reviewed_at IS NOT NULL` would strand
the closure until the 72h sweep.
