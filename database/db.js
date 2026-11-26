const { Pool } = require('pg');
const path = require('path');

const QUIET = process.env.NODE_ENV === 'test' && process.env.LOG_VERBOSE !== '1';
const { logWarn } = require('../lib/logger');

if (process.env.NODE_ENV === 'test') {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });
} else if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
} else {
  require('dotenv').config();
}

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
  ...(isSupabase && {
    sslmode: 'require'
  }),
  idleTimeoutMillis: 5 * 60 * 1000,
  keepAlive: true,
});

pool.on('connect', () => {
  if (!QUIET) console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
});

const SLOW_QUERY_MS = 500;

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (!QUIET) {
      const duration = Date.now() - start;
      console.log('Query executed', { text: text.substring(0, 50) + '...', duration, rows: res.rowCount });
      if (duration > SLOW_QUERY_MS) {
        logWarn('slow_query', { text: text.replace(/\s+/g, ' ').trim().substring(0, 200), durationMs: duration, rows: res.rowCount, poolWaiting: pool.waitingCount, poolTotal: pool.totalCount });
      }
    }
    return res;
  } catch (error) {
    console.error('Database query error:', { text, error: error.message });
    throw error;
  }
};

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

const close = async () => {
  if (!QUIET) console.log('Closing database connection pool...');
  await pool.end();
  if (!QUIET) console.log('Database connection pool closed');
};

module.exports = {
  query,
  transaction,
  close,
  pool
};
