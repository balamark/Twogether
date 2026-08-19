// Shaping contract for the 情緒深潛 (Emotional Deep Dive) AI calls.
//
// Lives here, not inside a provider, so the claude and mock providers cannot
// drift: e2e drives the whole journey through the mock, so a mock whose shape
// differed from Claude's would go green against a payload production never
// produces. Same reasoning as lib/closureAi.js and lib/therapyCards.js.
//
// Two output shapes, deliberately small:
//   reflection → { reflection, question }  (name-the-feeling / memory / past
//                 letter follow-up / partner reflective-listening coaching)
//   letter     → { letter }                (self-compassion letter, partner letter)

// A reflection is one short sentence the companion mirrors back, plus one
// gentle exploratory question. Kept tight so it reads as a companion, not an
// analyst writing a report.
const MAX_REFLECTION_CHARS = 120;
const MAX_QUESTION_CHARS = 80;
// A drafted letter is a few short paragraphs the user then edits — a starting
// point, never the finished thing.
const MAX_LETTER_CHARS = 600;

// Which reflection prompts exist (validated by the route + provider).
const REFLECTION_STEPS = ['emotion', 'memory', 'past', 'partner_mirror'];
// Which letters the AI will draft.
const LETTER_KINDS = ['compassion', 'partner'];

function clean(v) {
  return (v == null ? '' : String(v)).trim();
}

function cap(v, max) {
  const s = clean(v);
  return s.length > max ? s.slice(0, max) : s;
}

// { reflection, question } — an empty string on either is a legitimate outcome
// (the UI just shows fewer lines); it must never throw.
function shapeDeepDiveReflection(out, meta) {
  return {
    reflection: cap(out?.reflection, MAX_REFLECTION_CHARS),
    question: cap(out?.question, MAX_QUESTION_CHARS),
    _meta: meta,
  };
}

// { letter } — a draft the user edits. Trimmed, never invented into structure.
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
