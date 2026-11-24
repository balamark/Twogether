# 0010. Per-couple, time-boxed freemium

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `lib/entitlements.js`

## Decisions

- **Premium belongs to the couple and is time-boxed** (migration 040). A couple is
  `premium` while it holds an unexpired `couple_entitlements` row, and `free`
  otherwise. Unpaired users are `free`. Passes stack on the furthest-out expiry.
- **One table of caps per tier** (`FEATURE_LIMITS`). `UNLIMITED` means no cap.
  The in-code numbers are the product definition; env vars can override them
  for staging and prod.
- **To gate a feature:** add a key to `FEATURE_LIMITS` and call
  `assertWithinLimit()` at the enforcement point. Every cap-hit returns the same
  429 body with a per-feature `error_code`, which the frontend maps to the
  upgrade prompt.
- **Tier resolution fails open to `free`** on a DB error. We would rather
  under-charge than block a paying couple's core flow. This matches the
  fail-open budget in ADR 0006.
- Under `NODE_ENV=test` the free caps are effectively off. This is a known
  shortcut, tracked in #171.
