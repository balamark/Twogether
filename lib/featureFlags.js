// Feature flags: a tiny admin-controlled on/off registry backed by the
// `feature_flags` table (migration 065). Lets us ship UI behind a gate and flip
// it from /admin without a deploy. Reads are cached in-memory for a few seconds
// so the public endpoint the frontend polls on load stays cheap.
//
// Usage:
//   const { getPublicFlags, listFlags, setFlag } = require('../lib/featureFlags');
//   const flags = await getPublicFlags();   // { show_weekly_average: false, ... }

const db = require('../database/db');
const { logInfo, logWarn } = require('./logger');

// Known flags + their defaults. The DB row is the source of truth once it
// exists; this list is the fallback when the row/table is missing (fresh DB,
// migration not yet run) and also defines which keys are writable from admin.
const KNOWN_FLAGS = {
  show_weekly_average: {
    enabled: false,
    label: '周平均統計卡片',
    description: '在「記錄時光」顯示親密次數的周平均統計卡片。預設關閉，可在此開啟試用。',
  },
};

const CACHE_TTL_MS = 15 * 1000;
let cache = null; // { flags: {key: {enabled,label,description}}, at: epochMs }

function defaultsRowList() {
  return Object.entries(KNOWN_FLAGS).map(([key, def]) => ({
    key,
    enabled: def.enabled,
    label: def.label,
    description: def.description,
  }));
}

// Fetch the full flag set (merged DB rows over known defaults), cached.
async function loadFlags() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.flags;

  const merged = {};
  for (const [key, def] of Object.entries(KNOWN_FLAGS)) {
    merged[key] = { enabled: def.enabled, label: def.label, description: def.description };
  }

  try {
    const result = await db.query(
      'SELECT key, enabled, label, description FROM feature_flags'
    );
    for (const row of result.rows) {
      // Surface DB rows even for keys not in KNOWN_FLAGS so a flag added via
      // migration without a code change still shows up.
      merged[row.key] = {
        enabled: !!row.enabled,
        label: row.label || merged[row.key]?.label || row.key,
        description: row.description ?? merged[row.key]?.description ?? null,
      };
    }
  } catch (err) {
    // Table may not exist yet on a fresh DB — fall back to defaults silently.
    logWarn('feature_flags read failed; using defaults', { err: err.message });
  }

  cache = { flags: merged, at: Date.now() };
  return merged;
}

function invalidate() {
  cache = null;
}

// Public read: just the on/off map the frontend needs.
async function getPublicFlags() {
  const flags = await loadFlags();
  const out = {};
  for (const [key, val] of Object.entries(flags)) out[key] = !!val.enabled;
  return out;
}

// Admin read: full rows with labels + descriptions for the dashboard.
async function listFlags() {
  const flags = await loadFlags();
  return Object.entries(flags).map(([key, val]) => ({
    key,
    enabled: !!val.enabled,
    label: val.label,
    description: val.description ?? null,
  }));
}

function isKnownFlag(key) {
  return Object.prototype.hasOwnProperty.call(KNOWN_FLAGS, key);
}

// Admin write: upsert the flag's enabled state. Returns the new state.
async function setFlag(key, enabled) {
  if (!isKnownFlag(key)) {
    const err = new Error('unknown feature flag');
    err.code = 'UNKNOWN_FLAG';
    throw err;
  }
  const def = KNOWN_FLAGS[key];
  const next = !!enabled;
  await db.query(
    `INSERT INTO feature_flags (key, enabled, label, description, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
    [key, next, def.label, def.description]
  );
  invalidate();
  logInfo('feature flag updated', { key, enabled: next });
  return next;
}

module.exports = {
  KNOWN_FLAGS,
  getPublicFlags,
  listFlags,
  setFlag,
  isKnownFlag,
  invalidate,
  _defaultsRowList: defaultsRowList,
};
