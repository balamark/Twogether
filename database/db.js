const { Pool } = require('pg');
const path = require('path');

// Load environment variables based on NODE_ENV
if (process.env.NODE_ENV === 'test') {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });
} else if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
} else {
  require('dotenv').config();
}

// Database connection configuration
const isSupabase = process.env.DATABASE_URL?.includes('supabase.com');
const isLocal = process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isSupabase ? {
    rejectUnauthorized: false,
    require: true
  } : isLocal ? false : {
    rejectUnauthorized: false
  },
  // Add additional SSL options for Supabase
  ...(isSupabase && {
    sslmode: 'require'
  })
});

// Test the connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

// Database query helper
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('📊 Query executed', { text: text.substring(0, 50) + '...', duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('❌ Database query error:', { text, error: error.message });
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Close pool gracefully
const close = async () => {
  console.log('🔄 Closing database connection pool...');
  await pool.end();
  console.log('✅ Database connection pool closed');
};

module.exports = {
  query,
  transaction,
  close,
  pool
};
