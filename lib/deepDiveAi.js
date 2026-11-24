const MAX_REFLECTION_CHARS = 120;
const MAX_QUESTION_CHARS = 80;
const MAX_LETTER_CHARS = 600;

const REFLECTION_STEPS = ['emotion', 'memory', 'past', 'partner_mirror'];
const LETTER_KINDS = ['compassion', 'partner'];

function clean(v) {
  return (v == null ? '' : String(v)).trim();
}

function cap(v, max) {
  const s = clean(v);
  return s.length > max ? s.slice(0, max) : s;
}

function shapeDeepDiveReflection(out, meta) {
  return {
    reflection: cap(out?.reflection, MAX_REFLECTION_CHARS),
    question: cap(out?.question, MAX_QUESTION_CHARS),
    _meta: meta,
  };
}

function shapeDeepDiveLetter(out, meta) {
  return {
    letter: cap(out?.letter, MAX_LETTER_CHARS),
    _meta: meta,
  };
}

function isReflectionStep(step) {
  return REFLECTION_STEPS.includes(step);
}

function isLetterKind(kind) {
  return LETTER_KINDS.includes(kind);
}

module.exports = {
  MAX_REFLECTION_CHARS,
  MAX_QUESTION_CHARS,
  MAX_LETTER_CHARS,
  REFLECTION_STEPS,
  LETTER_KINDS,
  isReflectionStep,
  isLetterKind,
  shapeDeepDiveReflection,
  shapeDeepDiveLetter,
};
