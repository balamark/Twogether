import { describe, it, expect } from 'vitest';
import { computeMonthStats, parseDurationMinutes, timeSlot, isCheckinPending } from '../utils/intimacyStats';

describe('parseDurationMinutes', () => {
  it('reads the record-modal presets (both languages)', () => {
    expect(parseDurationMinutes('15-30分鐘')).toBe(23);
    expect(parseDurationMinutes('30-60分鐘')).toBe(45);
    expect(parseDurationMinutes('1小時以上')).toBe(60);
    expect(parseDurationMinutes('15–30 min')).toBe(23);
    expect(parseDurationMinutes('Over 1 hour')).toBe(60);
  });

  it('reads typed values and gives up on nonsense', () => {
    expect(parseDurationMinutes('45分')).toBe(45);
    expect(parseDurationMinutes('1.5 小時')).toBe(90);
    expect(parseDurationMinutes('1 hour 20 min')).toBe(80);
    expect(parseDurationMinutes('3 小時')).toBe(180);
    expect(parseDurationMinutes('90')).toBe(90);
    expect(parseDurationMinutes('半小時')).toBe(30);
    expect(parseDurationMinutes('很久')).toBeNull();
    expect(parseDurationMinutes('')).toBeNull();
    expect(parseDurationMinutes(undefined)).toBeNull();
  });
});

describe('timeSlot', () => {
  it('buckets the clock', () => {
    expect(timeSlot('07:30')).toBe('morning');
    expect(timeSlot('15:00')).toBe('afternoon');
    expect(timeSlot('21:30')).toBe('evening');
    expect(timeSlot('01:10')).toBe('night');
    expect(timeSlot(undefined)).toBeNull();
  });
});

describe('computeMonthStats', () => {
  const answered = (satisfaction: number, liked: string[] = [], timing: string | null = null) => ({
    answered_at: '2026-11-01T00:00:00Z', satisfaction, liked, timing,
  });
  const records = [
    { date: '2026-10-28', time: '22:00', duration: '30-60分鐘' },
    { date: '2026-11-02', time: '21:00', duration: '15-30分鐘', partnerCheckin: answered(5, ['atmosphere', 'foreplay'], 'perfect') },
    { date: '2026-11-02', time: '23:30' }, // same day twice → one intimate day for gaps
    { date: '2026-11-05', time: '21:30', myCheckin: answered(3, ['atmosphere']) },
    { date: '2026-11-15', time: '08:00', duration: '很久', partnerCheckin: { due_at: '2026-11-15T02:00:00Z' } }, // unanswered
  ];

  it('scopes counts, gaps and averages to the selected month', () => {
    const s = computeMonthStats(records, 2026, 10); // November
    expect(s.count).toBe(4);
    expect(s.prevCount).toBe(1);
    // gaps into Nov days: 11-02←10-28 = 5, 11-05←11-02 = 3, 11-15←11-05 = 10
    expect(s.avgGap).toBe(6);
    expect(s.longestGap).toBe(10);
    expect(s.shortestGap).toBe(3);
    expect(s.avgDurationMin).toBe(23);
    expect(s.durationSamples).toBe(1);
    expect(s.satisfaction).toBe(4);
    expect(s.satisfactionSamples).toBe(2);
    expect(s.topLiked[0]).toBe('atmosphere');
    expect(s.topSlot).toBe('evening');
    expect(s.bestRatedSlot).toBe('evening');
    expect(s.perfectTimingCount).toBe(1);
  });

  it('changes when the calendar pages to another month', () => {
    const oct = computeMonthStats(records, 2026, 9);
    expect(oct.count).toBe(1);
    expect(oct.avgGap).toBeNull(); // nothing before it
    expect(oct.avgDurationMin).toBe(45);
    expect(oct.satisfaction).toBeNull();

    const empty = computeMonthStats(records, 2026, 0);
    expect(empty.count).toBe(0);
    expect(empty.prevCount).toBe(0); // December 2025
    expect(empty.topSlot).toBeNull();
  });
});

describe('isCheckinPending', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  it('only surfaces due, open, fresh check-ins', () => {
    expect(isCheckinPending({ due_at: '2026-11-16T10:00:00Z' }, now)).toBe(true);
    expect(isCheckinPending({ due_at: '2026-11-16T13:00:00Z' }, now)).toBe(false); // not yet
    expect(isCheckinPending({ due_at: '2026-11-16T10:00:00Z', answered_at: '2026-11-16T11:00:00Z' }, now)).toBe(false);
    expect(isCheckinPending({ due_at: '2026-11-16T10:00:00Z', dismissed_at: '2026-11-16T11:00:00Z' }, now)).toBe(false);
    expect(isCheckinPending({ due_at: '2026-11-01T10:00:00Z' }, now)).toBe(false); // stale
    expect(isCheckinPending(null, now)).toBe(false);
  });
});
