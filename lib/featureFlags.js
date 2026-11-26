const db = require('../database/db');
const { logInfo, logWarn } = require('./logger');

const KNOWN_FLAGS = {
  show_weekly_average: {
    enabled: false,
    label: '周平均統計卡片',
    description: '在「記錄時光」顯示親密次數的周平均統計卡片。預設關閉，可在此開啟試用。',
  },
  goodwill_meter: {
    enabled: false,
    label: '好感存款（自動計算）',
    description: '關係之屋的好感存款量表與明細、「我們正在愛」+1 計數與最近動態的 +1 標記。感情存款上線後暫停，預設關閉。',
  },
};

const CACHE_TTL_MS = 15 * 1000;
let cache = null;

function defaultsRowList() {
  return Object.entries(KNOWN_FLAGS).map(([key, def]) => ({
    key,
    enabled: def.enabled,
    label: def.label,
    description: def.description,
  }));
}

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
      merged[row.key] = {
        enabled: !!row.enabled,
        label: row.label || merged[row.key]?.label || row.key,
        description: row.description ?? merged[row.key]?.description ?? null,
      };
    }
  } catch (err) {
    logWarn('feature_flags read failed; using defaults', { err: err.message });
  }

  cache = { flags: merged, at: Date.now() };
  return merged;
}

function invalidate() {
  cache = null;
}

async function getPublicFlags() {
  const flags = await loadFlags();
  const out = {};
  for (const [key, val] of Object.entries(flags)) out[key] = !!val.enabled;
  return out;
}

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
