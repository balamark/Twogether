import { describe, it, expect } from 'vitest';

// The judge's shape/threshold contract is shared by the claude provider and its
// unit tests (lib/reflectionJudge.js). It is plain CommonJS with no browser
// deps, so we require it directly and guard the two things production relies on:
// only a `hard` verdict blocks (triggers a regeneration), and anything missing
// or malformed fails OPEN so a flaky judge can never withhold a response.
/* eslint-disable @typescript-eslint/no-require-imports */
const judge = require('../../lib/reflectionJudge.js');

describe('reflectionJudge shaping', () => {
  it('a hard verdict does not pass (this is the only case worth a regen)', () => {
    const v = judge.shapeJudgeVerdict(
      { severity: 'hard', issues: ['#2 把對方的感受寫成了我的'], critique: '修正視角' },
      { usage: {}, costUsd: 0 }
    );
    expect(v.pass).toBe(false);
    expect(v.severity).toBe('hard');
    expect(v.issues.length).toBe(1);
    expect(v.critique).toBe('修正視角');
  });

  it('soft and ok verdicts pass (no costly regeneration)', () => {
    expect(judge.shapeJudgeVerdict({ severity: 'soft' }, {}).pass).toBe(true);
    expect(judge.shapeJudgeVerdict({ severity: 'ok' }, {}).pass).toBe(true);
  });

  it('fails open on null / malformed / unknown severity', () => {
    expect(judge.shapeJudgeVerdict(null, {}).pass).toBe(true);
    expect(judge.shapeJudgeVerdict(undefined, {}).pass).toBe(true);
    expect(judge.shapeJudgeVerdict({ severity: 'nonsense' }, {}).pass).toBe(true);
    expect(judge.shapeJudgeVerdict({}, {}).severity).toBe('ok');
  });

  it('caps critique and issues so a chatty judge cannot bloat the payload', () => {
    const v = judge.shapeJudgeVerdict(
      {
        severity: 'hard',
        critique: '長'.repeat(1000),
        issues: Array.from({ length: 20 }, (_, i) => `問題${i}`.repeat(50)),
      },
      {}
    );
    expect(v.critique.length).toBeLessThanOrEqual(judge.MAX_CRITIQUE_CHARS);
    expect(v.issues.length).toBeLessThanOrEqual(5);
    v.issues.forEach((i: string) => expect(i.length).toBeLessThanOrEqual(120));
  });

  it('passthroughVerdict always passes and carries a zero-cost meta', () => {
    const v = judge.passthroughVerdict('disabled');
    expect(v.pass).toBe(true);
    expect(v.skipped).toBe('disabled');
    expect(v._meta.costUsd).toBe(0);
    expect(v._meta.usage).toEqual({});
  });

  it('buildJudgeInstruction always yields a non-empty perspective directive', () => {
    expect(judge.buildJudgeInstruction('第2句視角錯了').length).toBeGreaterThan(0);
    // Even with no critique it still tells the model to re-check 我/你 attribution.
    expect(judge.buildJudgeInstruction('')).toContain('我');
  });

  it('isJudgeSurface recognizes exactly the two supported surfaces', () => {
    expect(judge.isJudgeSurface(judge.SURFACE_TRANSLATION)).toBe(true);
    expect(judge.isJudgeSurface(judge.SURFACE_COUNSELOR)).toBe(true);
    expect(judge.isJudgeSurface('something_else')).toBe(false);
  });
});
