# 0013. DB-backed feature flags

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/featureFlags.js`

## Decisions

- **Flags live in the `feature_flags` table** (migration 065) and are flipped from
  /admin without a deploy. Reads are cached for a few seconds, because the
  public flag endpoint is polled on every page load.
- **`KNOWN_FLAGS` defines the defaults and which keys admin can write.** The DB
  row wins once it exists. DB rows for keys missing from `KNOWN_FLAGS` still show
  up, so a flag added by migration alone appears.
- `goodwill_meter` (the auto-counted 好感存款 / 我們正在愛 +1) is off. While
  感情存款 is the app's single notion of 存款, two different "存款" numbers on
  one screen would read as a contradiction.
- The read currently falls back silently to defaults when the table is missing.
  That's a shortcut, tracked in #172.
