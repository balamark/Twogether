import path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.test'), override: true });

// Truncating `users` with CASCADE wipes every user-scoped table (couples,
// assessments, love_wishes, relationship_checkins, wall_posts, events, …) so a
// run never leaves test accounts behind. The rest are listed for clarity;
// CASCADE makes order irrelevant. Guarded to localhost only (see below).
const TEST_TABLES = [
  'users',
  'intimacy_requests',
  'pairing_requests',
  'pairing_codes',
  'love_moments',
  'custom_scripts',
  'custom_gifts',
  'coin_transactions',
  'notifications',
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
    await client.query(`TRUNCATE ${TEST_TABLES.join(', ')} RESTART IDENTITY CASCADE;`);
  } finally {
    await client.end();
  }
}
