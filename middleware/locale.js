const dict = require('../lib/i18n/serverMessages.en.json');
const { logInfo } = require('../lib/logger');
const { getRequestContext } = require('./request-context');

const TRANSLATABLE_KEYS = new Set([
  'message', 'error', 'msg', 'title', 'content', 'description', 'reason', 'hint',
  'label', 'tagline', 'styles', 'sample', 'goal', 'prompts', 'why', 'name',
  'fallback', 'body', 'detail',
  'item_label',
]);
const CJK = /[一-鿿]/;
const PH = /\{(\d+|[a-z_]+)\}/g;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exact = new Map(Object.entries(dict.exact));
const patterns = dict.patterns.map(([zh, en]) => {
  const names = [];
  const re = new RegExp(
    '^' + zh.split(PH).map((part, i) => {
      if (i % 2 === 1) { names.push(part); return '([\\s\\S]+?)'; }
      return escapeRe(part);
    }).join('') + '$',
  );
  return { re, names, en };
});

function translateString(s) {
  if (!CJK.test(s)) return s;
  const hit = exact.get(s);
  if (hit !== undefined) return hit;
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (!m) continue;
    return p.en.replace(PH, (_, name) => {
      const idx = p.names.indexOf(name);
      return idx >= 0 ? translateString(m[idx + 1]) : _;
    });
  }
  return s;
}

function translateDeep(value, key, depth) {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return key && TRANSLATABLE_KEYS.has(key) ? translateString(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => translateDeep(v, key, depth + 1));
  }
  if (typeof value === 'object') {
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = translateDeep(v, k, depth + 1);
    return out;
  }
  return value;
}

function localeMiddleware(req, res, next) {
  const header = String(req.get('x-locale') || '').toLowerCase();
  req.locale = header.startsWith('en') ? 'en' : 'zh-TW';
  const ctx = getRequestContext();
  if (ctx) ctx.locale = req.locale;
  if (req.locale !== 'en') return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    try {
      return originalJson(translateDeep(body, null, 0));
    } catch (err) {
      logInfo('i18n.translate_failed', { path: req.path, err: err.message });
      return originalJson(body);
    }
  };
  next();
}

module.exports = { localeMiddleware, translateString };
