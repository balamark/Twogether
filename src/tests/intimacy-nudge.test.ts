import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Contract test for the platform-voiced「溫柔提醒」tone catalog that backs the quick
// button on the 已經幾天沒有親密了 card. The reminder is authored BY Twogether (not
// the partner): pins that we always offer the recommended tone plus a random
// couple of others, substitute the real day count, and keep the copy free of
// partner-attribution. (CommonJS backend module, hence createRequire.)
const require = createRequire(import.meta.url);
const {
  TONES,
  RECOMMENDED_TONE_ID,
  DEFAULT_COUNT,
  selectToneIds,
  buildSuggestions,
  renderTone,
} = require('../../lib/intimacyNudgeTones.js');

describe('intimacy nudge tone catalog', () => {
  it('exposes the 12 curated tones with a recommended default', () => {
    expect(TONES).toHaveLength(12);
    expect(TONES.filter((t: { recommended?: boolean }) => t.recommended)).toHaveLength(1);
    expect(RECOMMENDED_TONE_ID).toBe('encourage');
  });

  it('selectToneIds returns the default count and always includes the recommended tone first', () => {
    for (let i = 0; i < 30; i += 1) {
      const ids = selectToneIds(DEFAULT_COUNT);
      expect(ids).toHaveLength(3);
      expect(ids[0]).toBe(RECOMMENDED_TONE_ID);
      expect(new Set(ids).size).toBe(ids.length); // no duplicates
    }
  });

  it('buildSuggestions substitutes the real day count and flags the recommended option', () => {
    const suggestions = buildSuggestions(['encourage', 'warm', 'minimal'], 8);
    expect(suggestions).toHaveLength(3);
    for (const s of suggestions) {
      expect(s.text).toContain('8 天');
      expect(s.text.trim().length).toBeGreaterThan(0);
      expect(s.text).not.toContain('{days}');
    }
    expect(suggestions[0].recommended).toBe(true);
  });

  it('is platform-voiced, not partner-voiced (no first-person longing)', () => {
    for (const t of TONES) {
      const text = renderTone(t, 8);
      expect(text).not.toMatch(/好想你|我想你|抱抱我/);
    }
  });

  it('handles an unknown day count without inventing a number', () => {
    const text = renderTone(TONES.find((t: { id: string }) => t.id === 'minimal'), null);
    expect(text).not.toContain('{days}');
    expect(text).toContain('一段時間');
  });
});
