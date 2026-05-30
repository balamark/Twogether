// Curated IANA timezone list shared by the Settings dropdown and the date formatter.
// Keep in sync with lib/timezone-options.js (server-side validation).

export interface TimezoneOption {
  value: string;
  label: string;
  short: string;
}

export const TIMEZONE_OPTIONS: ReadonlyArray<TimezoneOption> = [
  { value: 'Asia/Taipei',         label: '台北 (GMT+8)',     short: '台北' },
  { value: 'Asia/Hong_Kong',      label: '香港 (GMT+8)',     short: '香港' },
  { value: 'Asia/Shanghai',       label: '中國 (GMT+8)',     short: '上海' },
  { value: 'Asia/Tokyo',          label: '東京 (GMT+9)',     short: '東京' },
  { value: 'Asia/Seoul',          label: '首爾 (GMT+9)',     short: '首爾' },
  { value: 'Asia/Singapore',      label: '新加坡 (GMT+8)',   short: '新加坡' },
  { value: 'America/Los_Angeles', label: '美西 (PT)',        short: '美西' },
  { value: 'America/New_York',    label: '美東 (ET)',        short: '美東' },
  { value: 'Europe/London',       label: '倫敦 (GMT/BST)',   short: '倫敦' },
  { value: 'Europe/Paris',        label: '歐陸 (CET)',       short: '歐陸' },
  { value: 'Australia/Sydney',    label: '雪梨 (AET)',       short: '雪梨' },
];

export function getTimezoneShortLabel(value: string): string {
  return TIMEZONE_OPTIONS.find((o) => o.value === value)?.short ?? value;
}
