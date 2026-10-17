// Interface-language support for API responses.
//
// The React app sends `X-Locale: en` when the user picked English in the
// top-right switch (src/i18n/tr.ts). Route handlers keep writing their
// user-facing text in 繁中 — this middleware rewrites those strings to English
// on the way out, from one dictionary (lib/i18n/serverMessages.en.json), so no
// route needs to change.
//
// Only whitelisted keys are touched (message / error / title …): stored values
// such as mood tags, ids and user-written content are never in those keys or
// never match a dictionary entry exactly, so data round-trips unchanged.
// Strings the dictionary doesn't know (e.g. AI-generated text) pass through.
//
// Adding a new user-facing message? Add its English to
// lib/i18n/serverMessages.en.json (templated strings use {0}, {1}… in both).

const dict = require('../lib/i18n/serverMessages.en.json');
const { logInfo } = require('../lib/logger');
const { getRequestContext } = require('./request-context');

const TRANSLATABLE_KEYS = new Set([
  'message', 'error', 'msg', 'title', 'content', 'description', 'reason', 'hint',
  'label', 'tagline', 'styles', 'sample', 'goal', 'prompts', 'why', 'name',
  'fallback', 'body', 'detail',
  // Receipt/order line item ("Twogether Premium 90 天" / "視訊諮商 — 某諮商師").
  // Only billing responses carry this key, and the values come from our own
  // catalog, never from user input (lib/receipts.js).
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
      // Captured values may themselves be dictionary phrases (e.g. a verb or
      // a plan label) — translate them too; names/user text pass through.
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
    // Arrays inherit the parent key, so `styles: ['溫暖', …]` and
    // `errors: [{ msg }]` both work.
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
  // Shared with the LLM provider (services/llm/claudeProvider.js) so AI
  // replies follow the same language without threading it through every call.
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
