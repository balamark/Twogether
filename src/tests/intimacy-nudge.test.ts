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
  loadActiveTones,
  invalidateToneCache,
} = require('../../lib/intimacyNudgeTones.js');
const { translateString } = require('../../middleware/locale.js');

describe('intimacy nudge tone catalog', () => {
  it('exposes the 32 curated tones with a recommended default', () => {
    expect(TONES).toHaveLength(32);
    expect(new Set(TONES.map((t: { id: string }) => t.id)).size).toBe(TONES.length);
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

  it('ships an English version of every tone label and reminder', () => {
    for (const t of TONES) {
      const en = translateString(renderTone(t, 12));
      expect(en).not.toMatch(/[一-鿿]/);
      expect(en).toContain('12');
      expect(translateString(t.label)).not.toMatch(/[一-鿿]/);
    }
  });

  // ── Admin-managed catalog (table intimacy_nudge_tones) ──────────────────
  const adminTones = [
    { id: 'a', label: '甲', emoji: '🌟', sample: '已經 {days} 天囉', sample_en: '{days} days already', label_en: 'Alpha', recommended: false },
    { id: 'b', label: '乙', sample: '沒有天數的提醒', recommended: true },
    { id: 'c', label: '丙', sample: '{days} 天了', recommended: false },
  ];

  it('selects from an admin-supplied list, honoring its recommended tone', () => {
    for (let i = 0; i < 20; i += 1) {
      const ids = selectToneIds(3, adminTones);
      expect(ids[0]).toBe('b');
      expect([...ids].sort()).toEqual(['a', 'b', 'c']);
    }
    // Fewer tones than the requested count → only what exists.
    expect(selectToneIds(3, adminTones.slice(0, 2))).toHaveLength(2);
  });

  it('carries admin-authored English and renders {days} in it', () => {
    const [a, b] = buildSuggestions(['a', 'b'], 5, adminTones);
    expect(a).toMatchObject({ text: '已經 5 天囉', text_en: '5 days already', label_en: 'Alpha', emoji: '🌟' });
    expect(b.text_en).toBeUndefined();
    expect(b.emoji).toBe('💛');
    expect(buildSuggestions(['a'], null, adminTones)[0].text_en).toBe('a while already');
  });

  it('loadActiveTones reads the DB, caches it, and falls back to the built-ins', async () => {
    invalidateToneCache();
    let calls = 0;
    const db = { query: async () => { calls += 1; return { rows: adminTones }; } };
    expect(await loadActiveTones(db)).toBe(adminTones);
    await loadActiveTones(db);
    expect(calls).toBe(1); // cached
    invalidateToneCache();
    expect(await loadActiveTones({ query: async () => ({ rows: [] }) })).toBe(TONES);
    invalidateToneCache();
    expect(await loadActiveTones({ query: async () => { throw new Error('down'); } })).toBe(TONES);
    invalidateToneCache();
  });
});
