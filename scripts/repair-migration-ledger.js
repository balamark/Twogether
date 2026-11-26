#!/usr/bin/env node
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
    try { await db.close(); } catch { }
    process.exit(1);
  });
