import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.test'), override: true });

// Transient, fully test-generated tables — safe to wipe each run (truncating
// couples / wall_posts / events cascades to their children). We do NOT truncate
// `users` here: that would CASCADE-wipe the entire therapists table, including
// the migration-seeded default therapists (041) that migrate won't re-insert,
// breaking later runs. Instead we DELETE all user accounts below — which leaves
// the seeded therapists (user_id IS NULL) intact while removing every test
// account so they never accumulate (and never reach prod — see global-setup).
const TRUNCATE_TABLES = [
  'intimacy_requests',
  'pairing_requests',
  'pairing_codes',
  'love_moments',
  'custom_scripts',
  'custom_gifts',
  'coin_transactions',
  'notifications',
  'user_assessments',
  'love_wishes',
  'relationship_checkins',
  'relationship_reminder_log',
  'user_feedback',
  'wall_posts',
  'events',
  'couples',
];

export default async function globalTeardown() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('[global-teardown] DATABASE_URL not set, skipping');
    return;
  }
  const url = new URL(dbUrl);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`global-teardown refusing to run on host "${url.hostname}"`);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    // Only truncate tables that actually exist — a partially-migrated local test
    // DB shouldn't abort the whole teardown (and leave test users behind).
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [TRUNCATE_TABLES]
    );
    const existing = rows.map((r) => `"${r.table_name}"`);
    if (existing.length > 0) {
      await client.query(`TRUNCATE ${existing.join(', ')} RESTART IDENTITY CASCADE;`);
    }
    // Remove every test account; seeded therapists (user_id IS NULL) survive.
    await client.query(`DELETE FROM users;`);
  } finally {
    await client.end();
  }
}
