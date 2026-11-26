#!/usr/bin/env node
const db = require('../database/db');

async function main() {
  const { rows } = await db.query(`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity = false
    ORDER BY c.relname
  `);

  if (rows.length > 0) {
    console.error(`✗ ${rows.length} public table(s) have Row-Level Security DISABLED:`);
    rows.forEach((r) => console.error(`    - public.${r.relname}`));
    console.error(
      '\n  Anyone with the Supabase anon key can read/edit/delete these via the REST API.\n' +
      '  Add to the migration that creates the table:\n' +
      '    ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;'
    );
    process.exitCode = 1;
  } else {
    console.log('✓ RLS enabled on every public table');
  }
}

main()
  .catch((err) => {
    console.error('✗ RLS check failed to run:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close().catch(() => {}));
