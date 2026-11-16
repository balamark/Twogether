// Per-month intimacy numbers for the 你們的節奏 calendar. Pure functions so the
// month the calendar is showing drives every number (paging to last month
// recomputes them), and so they're unit-testable without React.

export interface CheckinAnswer {
  due_at?: string | null;
  answered_at?: string | null;
  dismissed_at?: string | null;
  satisfaction?: number | null;
  liked?: string[];
  timing?: string | null;
  note?: string | null;
}

export interface StatsRecord {
  date: string; // YYYY-MM-DD (viewer's tz)
  time?: string; // HH:mm
  duration?: string;
  myCheckin?: CheckinAnswer | null;
  partnerCheckin?: CheckinAnswer | null;
}

export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';

export interface MonthStats {
  count: number;
  prevCount: number;
  /** Days between consecutive intimate days, for every intimate day in this
   *  month (the first one measured back to the last day before the month). */
  avgGap: number | null;
  longestGap: number | null;
  shortestGap: number | null;
  /** Average of the records with a parsable 時長, in minutes. */
  avgDurationMin: number | null;
  durationSamples: number;
  /** Average 1–5 from answered 感受小調查 on this month's records. */
  satisfaction: number | null;
  satisfactionSamples: number;
  /** Most-picked 最喜歡 keys, most first (ties by first seen). */
  topLiked: string[];
  /** The time-of-day slot with the most records this month. */
  topSlot: TimeSlot | null;
  /** Slot that scored best in the surveys (needs ≥ 2 answers in that slot). */
  bestRatedSlot: TimeSlot | null;
  /** How many answers said 'perfect' timing (下次也這個時間). */
  perfectTimingCount: number;
}

const DAY_MS = 86400000;

function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(ymdToUtc(a) - ymdToUtc(b)) / DAY_MS);
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Best-effort minutes from the free-text 時長 field. Handles the presets
 * ("15-30分鐘", "30-60分鐘", "1小時以上", their English twins) and typed values
 * like "45分", "1.5 小時", "1 hour 20 min", "90". Ranges use the midpoint.
 * Returns null when nothing sensible can be read.
 */
export function parseDurationMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[–—~～至到]/g, '-').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const isHour = (u: string) => /^(小時|小时|鐘頭|hour|hours|hr|hrs|h)$/.test(u);
  const isMin = (u: string) => /^(分鐘|分钟|分|min|mins|minute|minutes|m)$/.test(u);

  // Range: "15-30分鐘", "1-2 hours"
  const range = s.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*([a-z一-鿿]+)?/);
  if (range) {
    const a = parseFloat(range[1]);
    const b = parseFloat(range[2]);
    const unit = range[3] ? range[3].replace(/以上|左右/g, '') : '';
    const mult = unit && isHour(unit) ? 60 : 1;
    const v = ((a + b) / 2) * mult;
    return v > 0 ? Math.round(v) : null;
  }

  let total = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)\s*([a-z一-鿿]+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const n = parseFloat(m[1]);
    const unit = (m[2] || '').replace(/以上|左右|多|over/g, '');
    if (unit && isHour(unit)) { total += n * 60; matched = true; }
    else if (unit && isMin(unit)) { total += n; matched = true; }
    else if (!unit) { total += n; matched = true; } // bare number → minutes
    else if (/^半/.test(unit)) { total += 30; matched = true; }
  }
  if (!matched && /半小時|half an hour/.test(s)) return 30;
  return matched && total > 0 ? Math.round(total) : null;
}

export function timeSlot(time: string | undefined): TimeSlot | null {
  if (!time) return null;
  const h = Number(time.slice(0, 2));
  if (!Number.isFinite(h)) return null;
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 23) return 'evening';
  return 'night';
}

/** Every answered check-in on a record (either partner's). */
function answers(r: StatsRecord): CheckinAnswer[] {
  return [r.myCheckin, r.partnerCheckin].filter(
    (c): c is CheckinAnswer => !!c && !!c.answered_at && typeof c.satisfaction === 'number',
  );
}

export function computeMonthStats(records: StatsRecord[], year: number, month: number): MonthStats {
  const key = monthKey(year, month);
  const prevKey = month === 0 ? monthKey(year - 1, 11) : monthKey(year, month - 1);
  const inMonth = records.filter((r) => r.date.startsWith(key));
  const prevCount = records.filter((r) => r.date.startsWith(prevKey)).length;

  // Gaps between distinct intimate days, looking back across the month edge.
  const allDays = [...new Set(records.map((r) => r.date))].sort();
  const gaps: number[] = [];
  allDays.forEach((d, i) => {
    if (i === 0 || !d.startsWith(key)) return;
    gaps.push(daysBetween(d, allDays[i - 1]));
  });

  const durations = inMonth.map((r) => parseDurationMinutes(r.duration)).filter((n): n is number => n !== null);

  const monthAnswers = inMonth.flatMap((r) => answers(r).map((a) => ({ a, slot: timeSlot(r.time) })));
  const satisfactionSum = monthAnswers.reduce((s, x) => s + (x.a.satisfaction as number), 0);

  const likedCount = new Map<string, number>();
  monthAnswers.forEach(({ a }) => (a.liked || []).forEach((k) => likedCount.set(k, (likedCount.get(k) || 0) + 1)));
  const topLiked = [...likedCount.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => k);

  const slotCount = new Map<TimeSlot, number>();
  inMonth.forEach((r) => {
    const s = timeSlot(r.time);
    if (s) slotCount.set(s, (slotCount.get(s) || 0) + 1);
  });
  const topSlot = [...slotCount.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;

  const slotScores = new Map<TimeSlot, number[]>();
  monthAnswers.forEach(({ a, slot }) => {
    if (!slot) return;
    slotScores.set(slot, [...(slotScores.get(slot) || []), a.satisfaction as number]);
  });
  let bestRatedSlot: TimeSlot | null = null;
  let bestAvg = -1;
  slotScores.forEach((scores, slot) => {
    if (scores.length < 2) return;
    const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
    if (avg > bestAvg) { bestAvg = avg; bestRatedSlot = slot; }
  });

  return {
    count: inMonth.length,
    prevCount,
    avgGap: gaps.length ? gaps.reduce((s, n) => s + n, 0) / gaps.length : null,
    longestGap: gaps.length ? Math.max(...gaps) : null,
    shortestGap: gaps.length ? Math.min(...gaps) : null,
    avgDurationMin: durations.length ? durations.reduce((s, n) => s + n, 0) / durations.length : null,
    durationSamples: durations.length,
    satisfaction: monthAnswers.length ? satisfactionSum / monthAnswers.length : null,
    satisfactionSamples: monthAnswers.length,
    topLiked,
    topSlot,
    bestRatedSlot,
    perfectTimingCount: monthAnswers.filter(({ a }) => a.timing === 'perfect').length,
  };
}

/** A check-in addressed to me that's due, still open, and not stale. */
export function isCheckinPending(c: CheckinAnswer | null | undefined, now = Date.now()): boolean {
  if (!c || c.answered_at || c.dismissed_at || !c.due_at) return false;
  const due = new Date(c.due_at).getTime();
  return Number.isFinite(due) && due <= now && now - due < 7 * DAY_MS;
}
