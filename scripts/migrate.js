#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

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