# 0007. AI output shaping lives outside the providers

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/closureAi.js`, `lib/deepDiveAi.js`, `lib/therapyCards.js` (`shapeFacilitatorTurn`), `lib/translationStatus.js`

## Context

e2e runs whole flows (closing → resolved, Deep Dive, Therapist Mode) through the
mock LLM provider. If the mock and Claude providers each shaped their own
output, the suite could pass against a payload production never produces.

## Decisions

- **Shaping functions live in `lib/` and both providers call them.**
- **Shapers never throw.** An empty result is a legitimate outcome (fewer chips,
  "no insight yet" plus a manual retry). The closure insight in particular runs
  after the finalize claim has already resolved the event.
- **Over-long items are dropped, not truncated.** Half a sentence reads as a
  bug; a missing chip just means fewer options.
- **Length budgets:**
  - closure commitments: 50 chars, at most 3. The earlier 30 was so tight that
    real output overshot it and 幫我想一個 showed nothing.
  - closure insight: 120 chars.
  - Deep Dive reflection: 120 chars, question: 80, so it reads like a companion
    rather than an analyst.
  - Deep Dive letter draft: 600 chars. A draft is a starting point, never the
    finished letter.
- **Translation results always report `requested` vs. `translated`**, plus a
  specific `error_code` when the user is owed an explanation. The batched call
  can be cut off at `max_tokens` mid tool_use, which makes the whole JSON
  unparseable. That used to return `200 {translations:{}}`, and the UI showed
  nothing.
- **Therapy-card shaping attaches the card's display metadata** to each turn, so
  the UI renders the chip from the payload and never drifts from the model's
  card ids. An unknown card falls back to `slow_down`.
