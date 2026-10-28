import { test, expect } from '@playwright/test';
import {
  predictCycle,
  predictNextPeriodStart,
  rhythmForDate,
  rhythmDateMap,
  rhythmPhase,
  addDays,
  DEFAULT_CYCLE_LENGTH,
} from '../src/utils/cycle';
import type { CycleRecord } from '../src/services/api';

// Pure unit coverage for the personalized calendar-method prediction and the
// 親密節奏 shading (PRD Feature A/B). No browser or server needed.

let seq = 0;
function rec(startDate: string, lengthDays = 5): CycleRecord {
  seq += 1;
  return { id: String(seq), trackedBy: 'u', startDate, lengthDays, createdAt: '' };
}
// Records from a start date and a list of cycle lengths.
function fromLengths(start: string, lengths: number[]): CycleRecord[] {
  const out = [rec(start)];
  let cur = start;
  for (const n of lengths) {
    cur = addDays(cur, n);
    out.push(rec(cur));
  }
  return out;
}

test.describe('predictCycle', () => {
  test('no records → no prediction', () => {
    expect(predictCycle([])).toBeNull();
    expect(predictNextPeriodStart([])).toBeNull();
  });

  test('one record → 28-day default, data limited, no window', () => {
    const p = predictCycle([rec('2026-10-05')])!;
    expect(p.method).toBe('calendar_default');
    expect(p.predictedCycleLength).toBe(DEFAULT_CYCLE_LENGTH);
    expect(p.nextPeriodStart).toBe('2026-11-02');
    expect(p.ovulation).toBe('2026-10-19'); // next period − 14
    expect(p.confidence).toBe('limited');
    expect(p.windowStart).toBeNull();
    expect(p.windowEnd).toBeNull();
  });

  test('fewer than 3 complete cycles → personalized date but 預測資料有限', () => {
    const p = predictCycle(fromLengths('2026-08-01', [30, 30]))!;
    expect(p.method).toBe('calendar_weighted');
    expect(p.predictedCycleLength).toBe(30);
    expect(p.confidence).toBe('limited');
    expect(p.windowStart).toBeNull();
  });

  test('blends full history with the latest 3 cycles', () => {
    // history mean = (26*3 + 32*3) / 6 = 29, recent (last 3) = 32 → 30.5 → 31
    const records = fromLengths('2026-01-01', [26, 26, 26, 32, 32, 32]);
    const p = predictCycle(records)!;
    expect(p.predictedCycleLength).toBe(31);
    const last = records[records.length - 1].startDate;
    expect(p.nextPeriodStart).toBe(addDays(last, 31));
    expect(p.ovulation).toBe(addDays(last, 31 - 14));
  });

  test('regular cycles → narrow window (never below ±2 days)', () => {
    const p = predictCycle(fromLengths('2026-03-01', [28, 28, 28, 28]))!;
    expect(p.confidence).toBe('steady');
    expect(p.windowStart).toBe(addDays(p.ovulation, -2));
    expect(p.windowEnd).toBe(addDays(p.ovulation, 2));
  });

  test('irregular cycles → wider window, flagged variable, capped at ±7', () => {
    const p = predictCycle(fromLengths('2026-01-01', [24, 36, 25, 35, 23, 37]))!;
    expect(p.confidence).toBe('variable');
    const half = (Date.parse(p.windowEnd!) - Date.parse(p.ovulation)) / 86400000;
    expect(half).toBeGreaterThan(2);
    expect(half).toBeLessThanOrEqual(7);
  });

  test('window width depends on variability, not a fixed size', () => {
    const steady = predictCycle(fromLengths('2026-01-01', [28, 29, 28, 29]))!;
    const wobbly = predictCycle(fromLengths('2026-01-01', [25, 31, 26, 32]))!;
    const width = (p: typeof steady) => (Date.parse(p.windowEnd!) - Date.parse(p.windowStart!)) / 86400000;
    expect(width(wobbly)).toBeGreaterThan(width(steady));
  });

  test('a missed month (implausible gap) is ignored for the prediction', () => {
    // 28, 28, 56 (forgot to log one), 28 → the 56 is dropped.
    const p = predictCycle(fromLengths('2026-01-01', [28, 28, 56, 28]))!;
    expect(p.predictedCycleLength).toBe(28);
    expect(p.completedCycles).toBe(3);
  });

  test('order of records does not matter; editing a start date re-predicts', () => {
    const records = fromLengths('2026-05-01', [28, 28, 28]);
    const a = predictCycle(records)!;
    const b = predictCycle(records.slice().reverse())!;
    expect(b).toEqual(a);
    const edited = records.map((r, i) => (i === records.length - 1 ? { ...r, startDate: addDays(r.startDate, 3) } : r));
    expect(predictCycle(edited)!.ovulation).not.toBe(a.ovulation);
  });

  test('crosses month and year boundaries correctly', () => {
    const p = predictCycle(fromLengths('2026-11-20', [28, 28, 28]))!;
    // last start 2027-02-12 (2026-11-20 + 84) → next 2027-03-12 → ovulation 2027-02-26
    expect(p.nextPeriodStart).toBe('2027-03-12');
    expect(p.ovulation).toBe('2027-02-26');
  });
});

test.describe('親密節奏 shading', () => {
  const prediction = predictCycle([rec('2026-10-05')])!; // ovulation 2026-10-19
  const ov = prediction.ovulation;

  test('±5 days, darkest on the predicted day, symmetric fade', () => {
    expect(rhythmForDate(prediction, addDays(ov, -6))).toBeNull();
    expect(rhythmForDate(prediction, addDays(ov, -5))).toEqual({ offset: -5, level: 1 });
    expect(rhythmForDate(prediction, addDays(ov, -1))).toEqual({ offset: -1, level: 5 });
    expect(rhythmForDate(prediction, ov)).toEqual({ offset: 0, level: 6 });
    expect(rhythmForDate(prediction, addDays(ov, 1))).toEqual({ offset: 1, level: 5 });
    expect(rhythmForDate(prediction, addDays(ov, 5))).toEqual({ offset: 5, level: 1 });
    expect(rhythmForDate(prediction, addDays(ov, 6))).toBeNull();
  });

  test('levels rise monotonically toward the predicted day', () => {
    const levels = [-5, -4, -3, -2, -1, 0].map(o => rhythmForDate(prediction, addDays(ov, o))!.level);
    expect(levels).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('rhythmDateMap covers exactly 11 days, spanning months', () => {
    const p = predictCycle([rec('2026-10-19')])!; // ovulation 2026-11-02 (the PRD example)
    expect(p.ovulation).toBe('2026-11-02');
    const m = rhythmDateMap(p);
    expect(m.size).toBe(11);
    expect(m.get('2026-10-28')).toEqual({ offset: -5, level: 1 });
    expect(m.get('2026-11-02')).toEqual({ offset: 0, level: 6 });
    expect(m.get('2026-11-07')).toEqual({ offset: 5, level: 1 });
    expect(rhythmDateMap(null).size).toBe(0);
  });

  test('phase labels per PRD', () => {
    expect(rhythmPhase(prediction, addDays(ov, -5))).toBe('approaching');
    expect(rhythmPhase(prediction, addDays(ov, -1))).toBe('near');
    expect(rhythmPhase(prediction, ov)).toBe('ovulation');
    expect(rhythmPhase(prediction, addDays(ov, 3))).toBe('after');
    expect(rhythmPhase(prediction, addDays(ov, 20))).toBeNull();
    expect(rhythmPhase(null, ov)).toBeNull();
  });
});
