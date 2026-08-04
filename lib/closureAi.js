// Shaping contract for the two 一起收尾 AI calls.
//
// Lives here rather than inside a provider so the claude and mock providers
// cannot drift: e2e drives the whole closing → resolved machine through the
// mock, so if the mock's shape differed from Claude's the suite would be
// green against a payload production never produces. Same reason
// shapeFacilitatorTurn sits in lib/therapyCards.js.

// A commitment has to be small enough to do this week and short enough to
// remember. Anything longer is a paragraph of intent, not an action.
const MAX_ASSIST_OPTION_CHARS = 30;
const MAX_ASSIST_OPTIONS = 3;
// The insight is one small paragraph under the summary card, not an essay.
const MAX_INSIGHT_CHARS = 120;

const ASSIST_FIELDS = ['commitment', 'decision'];

function clean(v) {
  return (v == null ? '' : String(v)).trim();
}

// { options: [...] } — 2-3 candidate sentences the user can tap to prefill the
// textarea. Over-long or empty entries are dropped rather than truncated: a
// half sentence reads as a bug, an absent one just means fewer chips.
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

// { insight: '…' } — Sophie's read on the finished pair of commitments. An
// empty string is a legitimate outcome (the caller treats it as "no insight
// yet" and offers the manual retry button); it must never throw, because this
// runs after the finalize claim has already resolved the event.
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
