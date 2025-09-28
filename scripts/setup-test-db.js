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

async function runCommand(command, description) {
  console.log(`📋 ${description}...`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stdout) console.log(stdout.trim());
    if (stderr && !stderr.includes('NOTICE')) console.warn(stderr.trim());
    console.log(`✅ ${description} completed`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return false;
  }
}

async function setupTestDatabase() {
  console.log('🚀 Setting up test database...\n');

  // Extract database info from DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not found in test environment');
    process.exit(1);
  }

  const dbName = dbUrl.split('/').pop();
  const baseUrl = dbUrl.substring(0, dbUrl.lastIndexOf('/'));

  console.log(`🗄️  Test database: ${dbName}`);
  console.log(`🔗 Connection: ${baseUrl}/[database]\n`);

  // 1. Create database if it doesn't exist
  const createDbSuccess = await runCommand(
    `psql "${baseUrl}/postgres" -c "CREATE DATABASE ${dbName};" 2>/dev/null || echo "Database already exists"`,
    'Create test database'
  );

  // 2. Run migrations
  const migrateSuccess = await runCommand(
    `NODE_ENV=test node ${path.join(__dirname, 'migrate.js')} migrate`,
    'Run database migrations'
  );

  if (!migrateSuccess) {
    console.error('❌ Migration failed, test database may be in inconsistent state');
    process.exit(1);
  }

  // 3. Verify database is ready
  const verifySuccess = await runCommand(
    `NODE_ENV=test node ${path.join(__dirname, 'migrate.js')} status`,
    'Verify migration status'
  );

  if (verifySuccess) {
    console.log('\n🎉 Test database setup completed successfully!');
    console.log('📝 The test database is now ready for integration tests.\n');
  } else {
    console.error('\n❌ Test database setup failed');
    process.exit(1);
  }
}

// Optional: Clean data for fresh test runs
async function cleanTestData() {
  if (process.argv.includes('--clean')) {
    console.log('🧹 Cleaning test data...');

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
    console.log('✅ Test data cleaned\n');
  }
}

// Run setup
if (require.main === module) {
  setupTestDatabase()
    .then(() => cleanTestData())
    .catch(error => {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupTestDatabase, cleanTestData };