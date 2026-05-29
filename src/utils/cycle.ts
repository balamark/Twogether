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

export function predictNextPeriodStart(records: CycleRecord[], fallback = 28): string | null {
  if (records.length === 0) return null;
  const sorted = sortAsc(records);
  const lastStart = sorted[sorted.length - 1].startDate;
  const avg = averageCycleLength(records) ?? fallback;
  return addDays(lastStart, Math.round(avg));
}

export interface OvulationWindow {
  ovulation: string;
  fertileStart: string;
  fertileEnd: string;
}

export function ovulationWindow(records: CycleRecord[]): OvulationWindow | null {
  const nextPeriod = predictNextPeriodStart(records);
  if (!nextPeriod) return null;
  const ovulation = addDays(nextPeriod, -14);
  return {
    ovulation,
    fertileStart: addDays(ovulation, -5),
    fertileEnd: addDays(ovulation, 1),
  };
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

export function fertileDateSet(records: CycleRecord[]): Set<string> {
  const w = ovulationWindow(records);
  if (!w) return new Set();
  const out = new Set<string>();
  const span = daysBetween(w.fertileStart, w.fertileEnd);
  for (let i = 0; i <= span; i++) {
    out.add(addDays(w.fertileStart, i));
  }
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
