import { describe, it, expect } from 'vitest';
import {
  detectConflictState,
  conflictSeverity,
  detectDraftTone,
  draftToneHint,
} from '../utils/conflictState';

const msg = (content: string, isAi = false) => ({ content, isAi });

describe('detectConflictState', () => {
  it('returns connection for calm, ordinary talk', () => {
    const s = detectConflictState([
      msg('今天晚餐想吃什麼？'),
      msg('都可以，你決定就好。'),
    ]);
    expect(s.level).toBe('connection');
    expect(s.message).toBe('');
  });

  it('returns connection for an empty thread', () => {
    expect(detectConflictState([]).level).toBe('connection');
  });

  it('flags escalation when both sides use absolute/blaming language', () => {
    const s = detectConflictState([
      msg('你總是把工作放第一。'),
      msg('都是你每次先發脾氣的。'),
    ]);
    expect(s.level).toBe('escalation');
    expect(s.message).not.toBe('');
  });

  it('does not nag on a single sharp line', () => {
    const s = detectConflictState([
      msg('你今天怎麼又遲到了？'),
      msg('抱歉，路上塞車。'),
    ]);
    expect(s.level).toBe('connection');
  });

  it('flags flooding on emotional overflow', () => {
    const s = detectConflictState([
      msg('你總是這樣。'),
      msg('夠了！我不想講了！！'),
    ]);
    expect(s.level).toBe('flooding');
  });

  it('flags flooding on an exclamation burst alone', () => {
    const s = detectConflictState([msg('為什麼要這樣對我？！！')]);
    expect(s.level).toBe('flooding');
  });

  it('flags crisis on divorce / walking-out threats and overrides lower levels', () => {
    const s = detectConflictState([
      msg('你總是這樣，我受不了了！！'),
      msg('那我們離婚好了。'),
    ]);
    expect(s.level).toBe('crisis');
  });

  it('ignores AI counselor messages as escalation signals', () => {
    const s = detectConflictState([
      msg('也許可以這樣說：我希望我們一起面對。', true),
      msg('謝謝你這樣說。'),
    ]);
    expect(s.level).toBe('connection');
  });

  it('only weighs the recent window, not cooled-off history', () => {
    // Two blaming lines, then six calm ones push them out of the 6-msg window.
    const cooled = [
      msg('你總是這樣，都是你害的。'),
      msg('每次都是我在讓步。'),
      msg('好，我懂了。'),
      msg('謝謝你願意聽。'),
      msg('那我們一起想辦法。'),
      msg('晚點一起吃飯吧。'),
      msg('好啊，我來訂位。'),
      msg('辛苦你了。'),
    ];
    expect(detectConflictState(cooled).level).toBe('connection');
  });

  it('orders severity connection < escalation < flooding < crisis', () => {
    expect(conflictSeverity('connection')).toBeLessThan(conflictSeverity('escalation'));
    expect(conflictSeverity('escalation')).toBeLessThan(conflictSeverity('flooding'));
    expect(conflictSeverity('flooding')).toBeLessThan(conflictSeverity('crisis'));
  });
});

describe('detectDraftTone', () => {
  it('stays quiet on a calm draft', () => {
    expect(detectDraftTone('我今天有點累，晚上早點休息好嗎？')).toBe('connection');
    expect(detectDraftTone('')).toBe('connection');
  });

  it('flags a SINGLE blaming line (unlike the thread classifier)', () => {
    expect(detectDraftTone('你從來都不聽我說話。')).toBe('escalation');
  });

  it('flags flooding on emotional overflow', () => {
    expect(detectDraftTone('我真的受夠了！')).toBe('flooding');
  });

  it('flags crisis on divorce/harm language', () => {
    expect(detectDraftTone('那我們乾脆離婚算了。')).toBe('crisis');
  });

  it('gives a hint for charged tones and none for connection', () => {
    expect(draftToneHint('escalation')).not.toBe('');
    expect(draftToneHint('crisis')).not.toBe('');
    expect(draftToneHint('connection')).toBe('');
  });
});
