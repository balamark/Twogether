import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Contract test for the「溫柔提醒」nudge generator that backs the quick button on
// the 已經幾天沒有親密了 card. Uses the deterministic mock provider (no live API):
// pins the shape the route + UI depend on — exactly three suggestions, each with
// a label + non-empty text, and the day count woven into the copy. (CommonJS
// backend module, hence createRequire.)
const require = createRequire(import.meta.url);
const mockProvider = require('../../services/llm/mockProvider.js');
const { BILLABLE_KINDS } = require('../../lib/aiUsage.js');

describe('generateIntimacyNudges — mock provider contract', () => {
  it('returns exactly three labelled, non-empty suggestions', async () => {
    const result = await mockProvider.generateIntimacyNudges({ days: 16 });
    expect(result.nudges).toHaveLength(3);
    for (const n of result.nudges) {
      expect(typeof n.label).toBe('string');
      expect(n.label.length).toBeGreaterThan(0);
      expect(n.text.trim().length).toBeGreaterThan(0);
    }
    expect(result.toxicityFlags).toEqual([]);
    expect(result._meta.provider).toBe('mock');
  });

  it('weaves the day count into the copy (fact stated neutrally)', async () => {
    const result = await mockProvider.generateIntimacyNudges({ days: 9 });
    expect(result.nudges.some((n: { text: string }) => n.text.includes('9 天'))).toBe(true);
  });

  it('is deterministic for the same day count', async () => {
    const a = await mockProvider.generateIntimacyNudges({ days: 12 });
    const b = await mockProvider.generateIntimacyNudges({ days: 12 });
    expect(a.nudges).toEqual(b.nudges);
  });

  it('handles an unknown day count without inventing a number', async () => {
    const result = await mockProvider.generateIntimacyNudges({ days: null });
    expect(result.nudges).toHaveLength(3);
    expect(result.nudges.every((n: { text: string }) => n.text.trim().length > 0)).toBe(true);
  });

  it('draws from the shared daily AI budget', () => {
    expect(BILLABLE_KINDS).toContain('intimacy_nudge');
  });
});
