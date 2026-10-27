import type { CycleRecord } from '../services/api';

// All date math is on YYYY-MM-DD strings only — never Date.toISOString round-trips,
// to avoid the UTC drift that already affected the heatmap.

function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.slice(0, 10).split('-').map(n => parseInt(n, 10));
  return { y, m, d };
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(ymd: string, delta: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return formatYmd(dt);
}

export function daysBetween(a: string, b: string): number {
  const A = parseYmd(a);
  const B = parseYmd(b);
  const da = new Date(A.y, A.m - 1, A.d);
  const db = new Date(B.y, B.m - 1, B.d);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function sortAsc(records: CycleRecord[]): CycleRecord[] {
  return records.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function computeCycleLengths(records: CycleRecord[]): number[] {
  const sorted = sortAsc(records);
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    out.push(daysBetween(sorted[i - 1].startDate, sorted[i].startDate));
  }
  return out;
}

export function averageCycleLength(records: CycleRecord[]): number | null {
  const lens = computeCycleLengths(records);
  if (lens.length === 0) return null;
  return lens.reduce((a, b) => a + b, 0) / lens.length;
}

// ─── Personalized prediction (calendar method) ───────────────────────────────
//
// Still the plain calendar method — next period = last start + predicted cycle
// length, ovulation ≈ next period − 14 days — but the cycle length now blends
// the user's whole history with their recent trend, and the 可能排卵區間 width
// comes from how much their own cycles vary. This is an ESTIMATE, never a
// confirmed ovulation date, and the blend has not been validated against real
// outcomes: don't advertise it as "more accurate".

// Gaps outside this range are almost always a missed month (or a duplicate
// entry), not a real cycle, so they're left out of the prediction. The plain
// average shown in Settings (averageCycleLength) still uses every gap.
const PLAUSIBLE_CYCLE_MIN = 18;
const PLAUSIBLE_CYCLE_MAX = 50;
const RECENT_CYCLES = 3;          // "近期趨勢" = the last 3 completed cycles
const RECENT_WEIGHT = 0.5;        // equal blend of history vs. recent trend
const MIN_CYCLES_FOR_WINDOW = 3;  // fewer → 預測資料有限 instead of a window
const LUTEAL_DAYS = 14;
// The ±half-width of the possible ovulation window. Even a perfectly regular
// cycle has a couple of days of luteal-phase wiggle, so never narrower than 2;
// capped so a very irregular history doesn't paint half the month.
const WINDOW_MIN_HALF = 2;
const WINDOW_MAX_HALF = 7;
// Above this standard deviation (days) cycles count as 變化較大.
const VARIABLE_SD = 4;

export const DEFAULT_CYCLE_LENGTH = 28;

export type PredictionMethod = 'calendar_weighted' | 'calendar_default';
// Deliberately a category, not a percentage — there's no validated model
// behind it. 'limited' = too few cycles to estimate a window at all.
export type PredictionConfidence = 'limited' | 'variable' | 'steady';

export interface CyclePrediction {
  method: PredictionMethod;
  confidence: PredictionConfidence;
  predictedCycleLength: number;     // whole days
  nextPeriodStart: string;          // YYYY-MM-DD
  ovulation: string;                // predicted_ovulation_date
  windowStart: string | null;       // possible_ovulation_window_start (null when limited)
  windowEnd: string | null;         // possible_ovulation_window_end
  completedCycles: number;          // plausible cycles used
  variabilityDays: number | null;   // sample SD of those cycles
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sampleSd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function predictCycle(records: CycleRecord[]): CyclePrediction | null {
  if (records.length === 0) return null;
  const sorted = sortAsc(records);
  const lastStart = sorted[sorted.length - 1].startDate;
  const all = computeCycleLengths(records);
  const plausible = all.filter(n => n >= PLAUSIBLE_CYCLE_MIN && n <= PLAUSIBLE_CYCLE_MAX);
  // Every gap implausible (e.g. two entries a few months apart): fall back to
  // the raw gaps rather than pretend the user has no history.
  const lengths = plausible.length > 0 ? plausible : all;

  let predictedCycleLength = DEFAULT_CYCLE_LENGTH;
  let method: PredictionMethod = 'calendar_default';
  if (lengths.length > 0) {
    const historical = mean(lengths);
    const recent = mean(lengths.slice(-RECENT_CYCLES));
    predictedCycleLength = Math.round(historical * (1 - RECENT_WEIGHT) + recent * RECENT_WEIGHT);
    method = 'calendar_weighted';
  }

  const nextPeriodStart = addDays(lastStart, predictedCycleLength);
  const ovulation = addDays(nextPeriodStart, -LUTEAL_DAYS);

  if (plausible.length < MIN_CYCLES_FOR_WINDOW) {
    return {
      method, confidence: 'limited', predictedCycleLength, nextPeriodStart, ovulation,
      windowStart: null, windowEnd: null,
      completedCycles: plausible.length, variabilityDays: null,
    };
  }

  const sd = sampleSd(plausible);
  const half = Math.min(WINDOW_MAX_HALF, Math.max(WINDOW_MIN_HALF, Math.ceil(sd)));
  return {
    method,
    confidence: sd > VARIABLE_SD ? 'variable' : 'steady',
    predictedCycleLength,
    nextPeriodStart,
    ovulation,
    windowStart: addDays(ovulation, -half),
    windowEnd: addDays(ovulation, half),
    completedCycles: plausible.length,
    variabilityDays: Math.round(sd * 10) / 10,
  };
}

export function predictNextPeriodStart(records: CycleRecord[]): string | null {
  return predictCycle(records)?.nextPeriodStart ?? null;
}

export interface OvulationWindow {
  ovulation: string;
  fertileStart: string;
  fertileEnd: string;
}

export function ovulationWindow(records: CycleRecord[]): OvulationWindow | null {
  const p = predictCycle(records);
  if (!p) return null;
  return {
    ovulation: p.ovulation,
    fertileStart: addDays(p.ovulation, -5),
    fertileEnd: addDays(p.ovulation, 1),
  };
}

// ─── 親密節奏 (rhythm) shading ───────────────────────────────────────────────
//
// A separate band from the possible ovulation window above: always 5 days
// either side of the PREDICTED ovulation date, shaded by distance. It shows
// "how close to the predicted ovulation day" — not desire, not consent.
export const RHYTHM_SPAN = 5;

export interface RhythmDay {
  offset: number;   // day − predicted ovulation (negative = before)
  level: number;    // 1 (±5 days) … 6 (the predicted day itself)
}

export function rhythmForDate(prediction: CyclePrediction | null, ymd: string): RhythmDay | null {
  if (!prediction) return null;
  const offset = daysBetween(prediction.ovulation, ymd);
  if (Math.abs(offset) > RHYTHM_SPAN) return null;
  return { offset, level: RHYTHM_SPAN + 1 - Math.abs(offset) };
}

export function rhythmDateMap(prediction: CyclePrediction | null): Map<string, RhythmDay> {
  const out = new Map<string, RhythmDay>();
  if (!prediction) return out;
  for (let o = -RHYTHM_SPAN; o <= RHYTHM_SPAN; o++) {
    out.set(addDays(prediction.ovulation, o), { offset: o, level: RHYTHM_SPAN + 1 - Math.abs(o) });
  }
  return out;
}

export type RhythmPhase = 'approaching' | 'near' | 'ovulation' | 'after' | 'in_window' | null;

// The phase label for the 親密節奏 card. 'in_window' = outside the ±5 band but
// still inside a (wide) possible ovulation window.
export function rhythmPhase(prediction: CyclePrediction | null, ymd: string): RhythmPhase {
  if (!prediction) return null;
  const r = rhythmForDate(prediction, ymd);
  if (r) {
    if (r.offset === 0) return 'ovulation';
    if (r.offset < 0) return r.offset >= -2 ? 'near' : 'approaching';
    return 'after';
  }
  if (prediction.windowStart && prediction.windowEnd && ymd >= prediction.windowStart && ymd <= prediction.windowEnd) {
    return 'in_window';
  }
  return null;
}

// All YYYY-MM-DD dates that fall inside any logged period span
// (start_date through start_date + length_days - 1).
export function periodDateSet(records: CycleRecord[]): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    for (let i = 0; i < r.lengthDays; i++) {
      out.add(addDays(r.startDate, i));
    }
  }
  return out;
}

// 危險期 / fertile window. The most fertile ("適合備孕的危險期") days fall a few
// days after the bleeding ends, so we anchor the window to the END of each
// logged period rather than to a single far-off predicted ovulation. Because
// it is derived per logged cycle from start_date + length_days, the green dots
// move whenever a period is added, removed, or has its start or length edited.
const FERTILE_GAP_AFTER_PERIOD = 4; // window opens ~4 days after bleeding ends
const FERTILE_WINDOW_DAYS = 7;      // spans ~1 week, covering ovulation

function addFertileWindow(out: Set<string>, startDate: string, lengthDays: number): void {
  const periodEnd = addDays(startDate, Math.max(1, lengthDays) - 1);
  const fertileStart = addDays(periodEnd, FERTILE_GAP_AFTER_PERIOD);
  for (let i = 0; i < FERTILE_WINDOW_DAYS; i++) {
    out.add(addDays(fertileStart, i));
  }
}

export function fertileDateSet(records: CycleRecord[], assumedLengthDays = 5): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    addFertileWindow(out, r.startDate, r.lengthDays);
  }
  // Forward-looking window for the predicted next period, so a fertile estimate
  // is also shown ahead of the next expected cycle.
  const nextStart = predictNextPeriodStart(records);
  if (nextStart) addFertileWindow(out, nextStart, assumedLengthDays);
  return out;
}

// Range of dates covering the predicted next period (defaults to a 5-day span).
export function predictedPeriodDateSet(records: CycleRecord[], assumedLengthDays = 5): Set<string> {
  const start = predictNextPeriodStart(records);
  if (!start) return new Set();
  const out = new Set<string>();
  for (let i = 0; i < assumedLengthDays; i++) {
    out.add(addDays(start, i));
  }
  return out;
}
