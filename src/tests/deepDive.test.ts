import { describe, it, expect } from 'vitest';
import { detectDraftTone } from '../utils/conflictState';

// The shaping contract is shared by the mock and claude providers (lib/deepDiveAi.js).
// It is plain CommonJS with no browser deps, so we can require it directly and
// guard the two things production relies on: output is capped, and the step /
// kind guards accept exactly the known values.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const deepDiveAi = require('../../lib/deepDiveAi.js');

describe('deepDiveAi shaping', () => {
  it('caps a reflection to the max lengths and always returns both fields', () => {
    const out = deepDiveAi.shapeDeepDiveReflection(
      { reflection: '長'.repeat(500), question: '問'.repeat(500) },
      { provider: 'test' }
    );
    expect(out.reflection.length).toBeLessThanOrEqual(deepDiveAi.MAX_REFLECTION_CHARS);
    expect(out.question.length).toBeLessThanOrEqual(deepDiveAi.MAX_QUESTION_CHARS);
    expect(out._meta.provider).toBe('test');
  });

  it('never throws on empty/absent AI output (empty strings are valid)', () => {
    const out = deepDiveAi.shapeDeepDiveReflection({}, {});
    expect(out.reflection).toBe('');
    expect(out.question).toBe('');
    const letter = deepDiveAi.shapeDeepDiveLetter({}, {});
    expect(letter.letter).toBe('');
  });

  it('caps a drafted letter', () => {
    const out = deepDiveAi.shapeDeepDiveLetter({ letter: '字'.repeat(5000) }, {});
    expect(out.letter.length).toBeLessThanOrEqual(deepDiveAi.MAX_LETTER_CHARS);
  });

  it('recognizes the known reflection steps and letter kinds only', () => {
    expect(deepDiveAi.isReflectionStep('emotion')).toBe(true);
    expect(deepDiveAi.isReflectionStep('partner_mirror')).toBe(true);
    expect(deepDiveAi.isReflectionStep('nonsense')).toBe(false);
    expect(deepDiveAi.isLetterKind('compassion')).toBe(true);
    expect(deepDiveAi.isLetterKind('partner')).toBe(true);
    // 'past' is guided as a reflection, not drafted as a letter kind.
    expect(deepDiveAi.isLetterKind('past')).toBe(false);
  });
});

// The safety exit reuses the shipped detector. Guard that the crisis phrases the
// journey must catch still trip it, so a self-harm line swaps to SafetyExitScreen.
describe('deep dive safety exit trigger', () => {
  it('flags self-harm / crisis free text as crisis', () => {
    expect(detectDraftTone('我不想活了')).toBe('crisis');
    expect(detectDraftTone('我想傷害自己')).toBe('crisis');
  });

  it('leaves ordinary painful-but-safe reflection alone', () => {
    expect(detectDraftTone('那時候我覺得沒有人聽我說話')).toBe('connection');
  });
});
