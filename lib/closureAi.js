const MAX_ASSIST_OPTION_CHARS = 50;
const MAX_ASSIST_OPTIONS = 3;
const MAX_INSIGHT_CHARS = 120;

const ASSIST_FIELDS = ['commitment', 'decision'];

function clean(v) {
  return (v == null ? '' : String(v)).trim();
}

function shapeClosureAssist(out, meta) {
  const raw = Array.isArray(out?.options) ? out.options : [];
  const options = [];
  for (const item of raw) {
    const text = clean(item);
    if (!text || text.length > MAX_ASSIST_OPTION_CHARS) continue;
    if (options.includes(text)) continue;
    options.push(text);
    if (options.length >= MAX_ASSIST_OPTIONS) break;
  }
  return { options, _meta: meta };
}

function shapeClosureInsight(out, meta) {
  let insight = clean(out?.insight);
  if (insight.length > MAX_INSIGHT_CHARS) insight = insight.slice(0, MAX_INSIGHT_CHARS);
  return { insight, _meta: meta };
}

function isAssistField(field) {
  return ASSIST_FIELDS.includes(field);
}

module.exports = {
  ASSIST_FIELDS,
  MAX_ASSIST_OPTION_CHARS,
  MAX_ASSIST_OPTIONS,
  MAX_INSIGHT_CHARS,
  isAssistField,
  shapeClosureAssist,
  shapeClosureInsight,
};
