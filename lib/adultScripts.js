const ADULT_TAGS = ['18+', '強度:露骨', '強度:激烈'];

function tagList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isAdultScriptTags(raw) {
  const tags = tagList(raw);
  return ADULT_TAGS.some((tag) => tags.includes(tag));
}

function adultScriptSql(column, startIndex) {
  const params = ADULT_TAGS.map((tag) => JSON.stringify([tag]));
  const checks = params.map((_, i) => `COALESCE(${column}, '[]'::jsonb) @> $${startIndex + i}::jsonb`);
  return { sql: `(${checks.join(' OR ')})`, params };
}

module.exports = {
  ADULT_TAGS,
  isAdultScriptTags,
  adultScriptSql,
};
