#!/usr/bin/env node

// Load environment variables based on NODE_ENV
const path = require('path');

if (process.env.NODE_ENV === 'test') {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });
} else if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
} else {
  require('dotenv').config();
}

const migrator = require('../database/migrator');

async function main() {
  const command = process.argv[2] || 'migrate';

  try {
    switch (command) {
      case 'migrate':
        console.log('🚀 Running database migrations...');
        await migrator.migrate();
        break;

      case 'status':
        console.log('📊 Checking migration status...');
        await migrator.status();
        break;

      default:
        console.log('Usage: node scripts/migrate.js [migrate|status]');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();