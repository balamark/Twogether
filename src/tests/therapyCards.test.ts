import { describe, it, expect } from 'vitest';
// Backend CommonJS module — the deck is shared truth for Therapist Mode.
import cards from '../../lib/therapyCards.js';

const { getCard, cardMeta, pickableCards, applyVerdict, scoreSession, shapeFacilitatorTurn, CARD_IDS } = cards;

describe('therapyCards deck', () => {
  it('exposes the 8-card starter deck with required fields', () => {
    expect(CARD_IDS).toContain('mirror');
    expect(CARD_IDS).toContain('need_translation');
    expect(CARD_IDS.length).toBe(8);
    for (const id of CARD_IDS) {
      const c = getCard(id);
      expect(c).toBeTruthy();
      expect(typeof c.label).toBe('string');
      expect(typeof c.emoji).toBe('string');
      expect(typeof c.evaluable).toBe('boolean');
    }
  });

  it('cardMeta returns only display fields (no prompt leakage)', () => {
    expect(cardMeta('mirror')).toEqual({ id: 'mirror', label: '鏡映', emoji: '🪞', color: 'sage' });
    expect(cardMeta('nope')).toBeNull();
  });
});

describe('shapeFacilitatorTurn (shared provider contract)', () => {
  const meta = { provider: 'test' };

  it('falls back to slow_down on unknown cards and both on unknown targets', () => {
    const t = shapeFacilitatorTurn({ card: 'made_up', target: 'C', say: 'hi', instruction: 'x' }, meta);
    expect(t.card).toBe('slow_down');
    expect(t.cardMeta?.id).toBe('slow_down');
    expect(t.target).toBe('both');
    expect(t._meta).toBe(meta);
  });

  it('caps quickReplies at 4 and drops empties', () => {
    const t = shapeFacilitatorTurn(
      { card: 'emotion_label', target: 'A', quickReplies: ['a', ' ', 'b', 'c', 'd', 'e'] },
      meta
    );
    expect(t.quickReplies).toEqual(['a', 'b', 'c', 'd']);
  });

  it('normalizes evaluation and rejects unknown verdicts', () => {
    const ok = shapeFacilitatorTurn(
      { card: 'mirror', target: 'B', evaluation: { verdict: 'partial', note: ' 快了 ' } },
      meta
    );
    expect(ok.evaluation).toEqual({ verdict: 'partial', note: '快了' });
    const bad = shapeFacilitatorTurn(
      { card: 'mirror', target: 'B', evaluation: { verdict: 'great', note: 'x' } },
      meta
    );
    expect(bad.evaluation).toBeNull();
  });
});

describe('pickableCards', () => {
  it('excludes the reactive 慢下來 card from the rotation', () => {
    const ids = pickableCards([]).map((c) => c.id);
    expect(ids).not.toContain('slow_down');
    expect(ids).toContain('mirror');
  });

  it('marks completed cards as done', () => {
    const picks = pickableCards(['mirror']);
    expect(picks.find((c) => c.id === 'mirror')?.done).toBe(true);
    expect(picks.find((c) => c.id === 'validation')?.done).toBe(false);
  });
});

describe('applyVerdict + scoreSession', () => {
  it('is null before anything is graded', () => {
    expect(scoreSession({})).toBeNull();
    expect(scoreSession(undefined)).toBeNull();
  });

  it('accumulates weighted accuracy per skill', () => {
    let s = {};
    s = applyVerdict(s, 'mirror', 'accurate'); // 1/1
    s = applyVerdict(s, 'validation', 'partial'); // 0.5/1
    expect(s.mirror).toEqual({ attempts: 1, score: 1 });
    expect(s.validation).toEqual({ attempts: 1, score: 0.5 });
    // overall = (1 + 0.5) / 2 attempts = 75%
    expect(scoreSession(s)).toBe(75);
  });

  it('counts an off attempt as zero but still an attempt', () => {
    let s = {};
    s = applyVerdict(s, 'mirror', 'accurate');
    s = applyVerdict(s, 'mirror', 'off');
    expect(s.mirror).toEqual({ attempts: 2, score: 1 });
    expect(scoreSession(s)).toBe(50);
  });

  it('ignores non-evaluable cards and unknown verdicts', () => {
    let s = {};
    s = applyVerdict(s, 'slow_down', 'accurate'); // not evaluable
    s = applyVerdict(s, 'mirror', 'bogus'); // unknown verdict
    expect(scoreSession(s)).toBeNull();
  });
});
