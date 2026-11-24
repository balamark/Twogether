# 0022. Database access & migrations

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: `database/db.js`, `database/migrator.js`, `scripts/migrate.js`, `scripts/check-rls.js`, `scripts/repair-migration-ledger.js`
- See also CLAUDE.md "Schema changes go in migrations only"

## Pool

- **Connections are kept warm** (`idleTimeoutMillis` 5 min, TCP `keepAlive`). pg's
  10s default meant the first tap after a short pause paid a fresh TCP and TLS
  handshake to the remote DB (often 300ms+). Keep-alive stops NATs and poolers
  from silently dropping idle connections.
- **`slow_query`** fires at 500 ms (docs/PERFORMANCE.md). The timing includes the
  wait for a free pool connection, so pool queueing under bursts shows up too.
- Supabase connections require SSL. `.env.test` is loaded under `NODE_ENV=test`.

## Migrator

- **Duplicate versions fail loudly.** Applied migrations are keyed by integer
  version (`_sqlx_migrations.version` PK), so a second file with the same number
  would be treated as applied and silently skipped. That is exactly what hid the
  `feature_flags` table behind a duplicate 063.
- **Results are recorded with an UPSERT**, so a previous failed attempt (a
  `success = false` row) doesn't wedge the retry with a duplicate-key error.

## RLS check

Supabase serves every public table through PostgREST to anyone with the public
anon key, so a table without RLS is open to the internet. Migration 063 enabled
RLS on the tables that existed then; about 35 later tables forgot it.
`check-rls.js` runs after `npm run migrate` and fails CI if any public table has
RLS off. The app is unaffected: it connects as `postgres` (bypassing RLS) and
never uses PostgREST.

## Ledger repair (runs on every staging deploy)

The coupons migration was renumbered 041 → 043 so 041 could become
`041_therapists`. Databases that had applied the old 041 kept a `version = 41` row,
so the new 041 never ran and 042 failed (`therapist_consultations` missing),
leaving a `success = false` row that wedged retries. `repair-migration-ledger.js`:

1. deletes `success = false` rows;
2. **only if the `therapists` table is missing** (an unambiguous sign of the
   pre-renumber row), deletes ledger rows ≥ 41, so the idempotent 041..044
   re-apply.

On a healthy DB, step 2 is skipped, so the script is safe to run on every deploy.
