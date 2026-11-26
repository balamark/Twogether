# 0015. Lazy sweeps instead of cron

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/momentCheckins.js` (same pattern as `routes/event-closure.js`)

## Decision

The app has no cron. Delayed work (such as the 感受小調查 check-in) is delivered by
a **lazy sweep**: busy GET endpoints call `sweepDueCheckins()` fire-and-forget,
and the sweep is throttled per process (60s).

- **Claim first, notify second.** `UPDATE … SET notified_at … RETURNING` claims
  the due rows, so only the instance that flipped `notified_at` delivers. Two
  instances can never double-send.
- **Check-in timing:**
  - asked 2 hours after the moment is recorded: the moment is over but still
    fresh;
  - only for moments from the last 24 hours, so back-filling last month's
    calendar doesn't buzz anyone;
  - expires after 7 days.
- The LINE copy carries no intimate detail.
- The answer keys are stored, and the zh-TW labels exist both here and in
  `MomentCheckinCard.tsx` (hand-synced: #169).
