#!/usr/bin/env node

/**
 * Test Database Setup Script
 *
 * This script ensures the test database is properly set up and migrated
 * before running integration tests. It will:
 * 1. Create the test database if it doesn't exist
 * 2. Run all migrations to ensure schema is up to date
 * 3. Optionally clean existing data for fresh test runs
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

// Set test environment
process.env.NODE_ENV = 'test';

// Load test environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

const QUIET = process.env.LOG_VERBOSE !== '1';

async function runCommand(command, description) {
  try {
    const { stdout, stderr } = await execAsync(command);
    if (!QUIET && stdout) console.log(stdout.trim());
    if (stderr && !stderr.includes('NOTICE')) console.warn(stderr.trim());
    return true;
  } catch (error) {
    console.error(`${description} failed:`, error.message);
    return false;
  }
}

function assertLocalDatabaseUrl(dbUrl) {
  let url;
  try {
    url = new URL(dbUrl);
  } catch (err) {
    console.error(`DATABASE_URL is not a valid URL: ${err.message}`);
    process.exit(1);
  }
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (!isLocal) {
    console.error(`REFUSING TO RUN: DATABASE_URL points at "${url.hostname}", not localhost.`);
    console.error('   This script only runs against a local Postgres test DB.');
    process.exit(1);
  }
  return url;
}

async function setupTestDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found in test environment');
    process.exit(1);
  }

  const url = assertLocalDatabaseUrl(dbUrl);

  // Precondition: Postgres must be reachable.
  const port = url.port || '5432';
  try {
    await execAsync(`pg_isready -h ${url.hostname} -p ${port}`);
  } catch (err) {
    console.error(`Postgres is not reachable at ${url.hostname}:${port}.`);
    console.error('   Start it with: brew services start postgresql');
    process.exit(1);
  }

  const dbName = dbUrl.split('/').pop();
  const baseUrl = dbUrl.substring(0, dbUrl.lastIndexOf('/'));

  // 1. Create database if it doesn't exist (no-op if already present).
  await runCommand(
    `psql "${baseUrl}/postgres" -c "CREATE DATABASE ${dbName};" 2>/dev/null || true`,
    'Create test database'
  );

  // 2. Run migrations (idempotent).
  const migrateSuccess = await runCommand(
    `NODE_ENV=test node ${path.join(__dirname, 'migrate.js')} migrate`,
    'Run database migrations'
  );

  if (!migrateSuccess) {
    console.error('Migration failed, test database may be in inconsistent state');
    process.exit(1);
  }
}

// Optional: Clean data for fresh test runs
async function cleanTestData() {
  if (process.argv.includes('--clean')) {
    // Defense in depth — also guard the nuclear DELETE path.
    assertLocalDatabaseUrl(process.env.DATABASE_URL);

    const cleanCommands = [
      'DELETE FROM pairing_requests;',
      'DELETE FROM pairing_codes;',
      'DELETE FROM love_moments;',
      'DELETE FROM couples;',
      'DELETE FROM users;',
      'DELETE FROM _sqlx_migrations WHERE version NOT IN (SELECT version FROM _sqlx_migrations WHERE success = true);'
    ];

    for (const command of cleanCommands) {
      await runCommand(
        `psql "${process.env.DATABASE_URL}" -c "${command}"`,
        `Clean: ${command.split(' ')[2]}`
      );
    }
  }
}

// Run setup
if (require.main === module) {
  setupTestDatabase()
    .then(() => cleanTestData())
    .catch(error => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

// Clean specific test users by email
async function cleanupTestUsers(emailList) {
  if (!emailList || emailList.length === 0) {
    return;
  }

  for (const email of emailList) {
    try {
      // Clean up related data first (foreign key constraints)
      await runCommand(
        `psql "${process.env.DATABASE_URL}" -c "DELETE FROM love_moments WHERE couple_id IN (SELECT id FROM couples WHERE user1_id IN (SELECT id FROM users WHERE email = '${email}') OR user2_id IN (SELECT id FROM users WHERE email = '${email}'));"`,
        `Clean love moments for ${email}`
      );

      await runCommand(
        `psql "${process.env.DATABASE_URL}" -c "DELETE FROM pairing_codes WHERE couple_id IN (SELECT id FROM couples WHERE user1_id IN (SELECT id FROM users WHERE email = '${email}') OR user2_id IN (SELECT id FROM users WHERE email = '${email}'));"`,
        `Clean pairing codes for ${email}`
      );

      await runCommand(
        `psql "${process.env.DATABASE_URL}" -c "DELETE FROM couples WHERE user1_id IN (SELECT id FROM users WHERE email = '${email}') OR user2_id IN (SELECT id FROM users WHERE email = '${email}');"`,
        `Clean couples for ${email}`
      );

      await runCommand(
        `psql "${process.env.DATABASE_URL}" -c "DELETE FROM users WHERE email = '${email}';"`,
        `Clean user ${email}`
      );

    } catch (error) {
      console.log(`   Failed to cleanup user ${email}: ${error.message}`);
    }
  }
}

module.exports = { setupTestDatabase, cleanTestData, cleanupTestUsers };