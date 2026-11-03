#!/usr/bin/env node
// Fails (exit 1) if any table in the public schema has Row-Level Security off.
//
// Why: Supabase serves every public table at https://<ref>.supabase.co/rest/v1/
// to anyone holding the (public) anon key. A table without RLS is fully
// readable/writable/deletable from the internet. Migration 063 enabled RLS on
// the tables that existed then, but ~35 later tables forgot it and Supabase
// flagged them (rls_disabled_in_public). Run this right after `npm run migrate`
// so a new migration that forgets `ENABLE ROW LEVEL SECURITY` fails CI instead
// of shipping an open table.
//
// The app itself is unaffected by RLS: the backend connects as `postgres`
// (bypasses RLS), and the app never uses PostgREST.
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
