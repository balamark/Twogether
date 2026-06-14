#!/usr/bin/env node
//
// Idempotent, guarded repair for `_sqlx_migrations` ledger drift.
//
// Background: the coupons migration was renumbered 041 -> 043 (commit 6b167cf)
// so that 041 could become `041_therapists`. Any database that had already
// applied the OLD 041 (coupons) keeps a `version = 41` row whose content no
// longer matches the file on disk. The runner skips version 41, so the new
// `041_therapists` never runs, and `042_consultation_chat` then fails with
// `relation "therapist_consultations" does not exist`. The failed attempt also
// leaves a `success = false` row that wedges retries with a duplicate-key error.
//
// This script reconciles that drift WITHOUT touching healthy databases:
//   1. Delete any `success = false` rows so failed attempts retry cleanly.
//   2. ONLY IF the `therapists` table is missing (the unambiguous signal that
//      version 41 is the pre-renumber coupons row, not the therapists one),
//      delete ledger rows for version >= 41 so the correctly-numbered
//      041..044 re-apply. All of 041..044 are idempotent (CREATE ... IF NOT
//      EXISTS, ADD COLUMN IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING),
//      so re-applying over the already-present coupons tables is a no-op.
//
// On a healthy database (therapists table present) step 2 is skipped, so this
// is safe to run on production / on every deploy — it self-disables once the
// ledger is consistent.
require('dotenv').config();
const db = require('../database/db');

async function main() {
  const url = process.env.DATABASE_URL || '';
  console.log('🔧 Repairing migration ledger on:', url.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2') || '(no DATABASE_URL)');

  await db.transaction(async (client) => {
    const failed = await client.query('DELETE FROM _sqlx_migrations WHERE success = false RETURNING version');
    if (failed.rowCount > 0) {
      console.log(`  • cleared ${failed.rowCount} failed migration row(s): ${failed.rows.map(r => r.version).join(', ')}`);
    } else {
      console.log('  • no failed migration rows to clear');
    }

    const { rows } = await client.query("SELECT to_regclass('public.therapists') AS reg");
    const therapistsExists = rows[0].reg !== null;

    if (therapistsExists) {
      console.log('  • therapists table present — ledger is consistent, no drift repair needed');
      return;
    }

    const drift = await client.query('DELETE FROM _sqlx_migrations WHERE version >= 41 RETURNING version');
    console.log(`  • therapists table missing — removed stale ledger row(s) for version >= 41: ${drift.rows.map(r => r.version).join(', ') || '(none)'}`);
    console.log('  • migrations 041..044 will now re-apply on the next `npm run migrate` (all idempotent)');
  });

  console.log('✅ Ledger repair complete');
}

main()
  .then(async () => { await db.close(); process.exit(0); })
  .catch(async (err) => {
    console.error('❌ Ledger repair failed:', err.message);
    try { await db.close(); } catch { /* ignore */ }
    process.exit(1);
  });
