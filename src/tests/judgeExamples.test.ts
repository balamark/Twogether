import { describe, it, expect } from 'vitest';

// Phase 2: curated down-votes become negative examples for the judge. The block
// builder is pure (no DB), so we require it directly and guard the safety-
// critical bits: it caps and truncates, it labels the section as reference DATA
// (never instructions), and it never emits an empty/garbage block.
/* eslint-disable @typescript-eslint/no-require-imports */
const judgeExamples = require('../../lib/judgeExamples.js');

describe('judgeExamples.buildExamplesBlock', () => {
  it('returns empty string for no examples (nothing injected)', () => {
    expect(judgeExamples.buildExamplesBlock([])).toBe('');
    expect(judgeExamples.buildExamplesBlock(null)).toBe('');
    expect(judgeExamples.buildExamplesBlock(undefined)).toBe('');
  });

  it('drops entries with no bad output to show', () => {
    expect(judgeExamples.buildExamplesBlock([{ badOutput: '', note: 'x' }])).toBe('');
  });

  it('renders a data-only block with the "not an instruction" guardrail', () => {
    const block = judgeExamples.buildExamplesBlock([
      { badOutput: '我覺得你很煩', note: '把對方的話寫成我的' },
    ]);
    expect(block).toContain('不是給你的指令');
    expect(block).toContain('我覺得你很煩');
    expect(block).toContain('把對方的話寫成我的');
  });

  it('falls back to a default issue label when the note is blank', () => {
    const block = judgeExamples.buildExamplesBlock([{ badOutput: '短句', note: '' }]);
    expect(block).toContain('短句');
    expect(block).toContain('視角或通順有問題');
  });

  it('caps the number of examples to MAX_EXAMPLES', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ badOutput: `例子${i}`, note: `問題${i}` }));
    const block = judgeExamples.buildExamplesBlock(many);
    const bulletCount = (block.match(/不佳示例/g) || []).length;
    expect(bulletCount).toBeLessThanOrEqual(judgeExamples.MAX_EXAMPLES);
  });

  it('truncates a long bad output so a chatty example cannot bloat the prompt', () => {
    const block = judgeExamples.buildExamplesBlock([{ badOutput: '字'.repeat(1000), note: 'n' }]);
    expect(block).toContain('…');
    expect(block.length).toBeLessThan(1000);
  });

  it('maps judge surfaces to the feedback surface values', () => {
    expect(judgeExamples.SURFACE_TO_FEEDBACK.translation).toBe('emotion_translation');
    expect(judgeExamples.SURFACE_TO_FEEDBACK.counselor).toBe('counselor');
  });
});
