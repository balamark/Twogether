// Timezone-aware formatters for shared timestamps (intimacy, events, wall, etc.).
// All formatters honor an IANA timezone (e.g. 'Asia/Taipei') passed by the caller,
// which typically comes from <TimezoneProvider> populated with the couple's primary tz.

import { TIMEZONE_OPTIONS, getTimezoneShortLabel } from './timezone-options';

export interface DateTimeOptions {
  // When true, always append " (短標籤)" even if tz matches the viewer's browser tz.
  // Used for scheduled times where the timezone must be unambiguous.
  alwaysShowTz?: boolean;
  withYear?: boolean;
}

export function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function shouldAppendTz(tz: string, opts?: DateTimeOptions): boolean {
  if (opts?.alwaysShowTz) return true;
  return tz !== browserTz();
}

function formatPartsZh(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('zh-TW', opts).format(date);
}

function safeDate(value: string | Date): Date | null {
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

// "5/30 (五) 20:00 (台北)" — full date + time + optional timezone suffix.
export function formatDateTime(value: string | Date, tz: string, opts?: DateTimeOptions): string {
  const date = safeDate(value);
  if (!date) return '';
  const dateOpts: Intl.DateTimeFormatOptions = opts?.withYear
    ? { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: tz }
    : { month: 'numeric', day: 'numeric', timeZone: tz };
  const dateStr = formatPartsZh(date, dateOpts);
  const weekday = formatPartsZh(date, { weekday: 'narrow', timeZone: tz });
  const timeStr = formatPartsZh(date, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  const suffix = shouldAppendTz(tz, opts) ? ` (${getTimezoneShortLabel(tz)})` : '';
  return `${dateStr} (${weekday}) ${timeStr}${suffix}`;
}

// "5/30 (五)" — date only, no time component.
export function formatDate(
  value: string | Date,
  tz: string,
  opts?: Intl.DateTimeFormatOptions & { withWeekday?: boolean }
): string {
  const date = safeDate(value);
  if (!date) return '';
  const { withWeekday = true, ...rest } = opts || {};
  const baseOpts: Intl.DateTimeFormatOptions = Object.keys(rest).length
    ? { ...rest, timeZone: tz }
    : { month: 'numeric', day: 'numeric', timeZone: tz };
  const dateStr = formatPartsZh(date, baseOpts);
  if (!withWeekday) return dateStr;
  const weekday = formatPartsZh(date, { weekday: 'narrow', timeZone: tz });
  return `${dateStr} (${weekday})`;
}

// "20:00"
export function formatTimeOnly(value: string | Date, tz: string): string {
  const date = safeDate(value);
  if (!date) return '';
  return formatPartsZh(date, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
}

// "2026-06-06" — YYYY-MM-DD in the given tz. Used to key calendar cells and
// match against date-only record fields. Avoid toISOString().split('T')[0]:
// that returns UTC YMD and shifts the date by the tz offset (e.g. Saturday
// midnight in Asia/Taipei renders as the previous Friday).
export function formatYmdInTz(value: string | Date, tz: string): string {
  const date = safeDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// "2026年5月" — calendar header.
export function formatMonthYear(value: string | Date, tz: string): string {
  const date = safeDate(value);
  if (!date) return '';
  return formatPartsZh(date, { year: 'numeric', month: 'long', timeZone: tz });
}

// Relative for recent timestamps, falls back to absolute date for older.
// Replaces the duplicated logic in WallPostThread / WallView / NotificationInbox.
export function formatRelativeOrDate(
  value: string | Date,
  tz: string,
  fallbackOpts?: Intl.DateTimeFormatOptions
): string {
  const date = safeDate(value);
  if (!date) return '';
  const now = Date.now();
  const diffMs = now - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < minute) return '剛剛';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} 分鐘前`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} 小時前`;
  if (diffMs < week) return `${Math.floor(diffMs / day)} 天前`;

  const opts: Intl.DateTimeFormatOptions = fallbackOpts
    ? { ...fallbackOpts, timeZone: tz }
    : { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: tz };
  return formatPartsZh(date, opts);
}

// Parses a `<input type="datetime-local">` value "YYYY-MM-DDTHH:mm" interpreted in tz,
// returns the corresponding UTC ISO string. Survives DST transitions because the offset
// is computed at the candidate UTC moment.
export function localInputToIsoInTz(localValue: string, tz: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localValue);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6] || 0);

  // Treat the wall-clock as if it were UTC; this is just a candidate instant.
  const candidateUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  // Compute what wall-clock that candidate maps to inside tz.
  // The diff is exactly tz's UTC offset at that moment.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = dtf.formatToParts(new Date(candidateUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const tzY = get('year');
  const tzMo = get('month');
  const tzD = get('day');
  let tzH = get('hour');
  const tzMi = get('minute');
  const tzS = get('second');
  if (tzH === 24) tzH = 0; // en-US sometimes returns 24 at midnight.
  const tzWallAsUtc = Date.UTC(tzY, tzMo - 1, tzD, tzH, tzMi, tzS);
  const offsetMs = tzWallAsUtc - candidateUtc;
  return new Date(candidateUtc - offsetMs).toISOString();
}

// Inverse of localInputToIsoInTz — for prefilling `<input type="datetime-local">`.
export function isoToLocalInputInTz(iso: string, tz: string): string {
  const date = safeDate(iso);
  if (!date) return '';
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  let h = get('hour');
  if (h === '24') h = '00';
  return `${get('year')}-${get('month')}-${get('day')}T${h}:${get('minute')}`;
}

// Fallback chain: couple primary → viewer's own → browser default.
export function getPrimaryTimezone(state: {
  couplePrimaryTz?: string | null;
  userTz?: string | null;
}): string {
  if (state.couplePrimaryTz) return state.couplePrimaryTz;
  if (state.userTz) return state.userTz;
  return browserTz();
}

// Re-export so callers don't need both modules.
export { TIMEZONE_OPTIONS, getTimezoneShortLabel };
