// What counts as an 18+ marketplace script.
//
// There is no intensity column. The marketplace bot always adds the tag `18+`
// (even for mild) and `強度:<label>` for the intensity it was given. The
// in-app uploader stores the same tags array. A script is adult when that
// array contains `18+`, or the explicit/intense labels `強度:露骨` /
// `強度:激烈`. Mild and moderate (`強度:清淡`, `強度:中等`) stay visible.

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

// SQL predicate matching isAdultScriptTags. `column` is a tags jsonb column
// (optionally qualified, e.g. s.tags). Bindings start at `startIndex`.
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
