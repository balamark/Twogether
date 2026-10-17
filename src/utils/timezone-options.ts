import { tr } from '../i18n/tr';

// Curated IANA timezone list shared by the Settings dropdown and the date formatter.
// Keep in sync with lib/timezone-options.js (server-side validation).

export interface TimezoneOption {
  value: string;
  label: string;
  short: string;
}

export const TIMEZONE_OPTIONS: ReadonlyArray<TimezoneOption> = [
  { value: 'Asia/Taipei',         label: tr('台北 (GMT+8)', 'Taipei (GMT+8)'),     short: tr('台北', 'Taipei') },
  { value: 'Asia/Hong_Kong',      label: tr('香港 (GMT+8)', 'Hong Kong (GMT+8)'),     short: tr('香港', 'Hong Kong') },
  { value: 'Asia/Shanghai',       label: tr('中國 (GMT+8)', 'China (GMT+8)'),     short: tr('上海', 'Shanghai') },
  { value: 'Asia/Tokyo',          label: tr('東京 (GMT+9)', 'Tokyo (GMT+9)'),     short: tr('東京', 'Tokyo') },
  { value: 'Asia/Seoul',          label: tr('首爾 (GMT+9)', 'Seoul (GMT+9)'),     short: tr('首爾', 'Seoul') },
  { value: 'Asia/Singapore',      label: tr('新加坡 (GMT+8)', 'Singapore (GMT+8)'),   short: tr('新加坡', 'Singapore') },
  { value: 'America/Los_Angeles', label: tr('美西 (PT)', 'US Pacific (PT)'),        short: tr('美西', 'US Pacific') },
  { value: 'America/New_York',    label: tr('美東 (ET)', 'US Eastern (ET)'),        short: tr('美東', 'US Eastern') },
  { value: 'Europe/London',       label: tr('倫敦 (GMT/BST)', 'London (GMT/BST)'),   short: tr('倫敦', 'London') },
  { value: 'Europe/Paris',        label: tr('歐陸 (CET)', 'Central Europe (CET)'),       short: tr('歐陸', 'Central Europe') },
  { value: 'Australia/Sydney',    label: tr('雪梨 (AET)', 'Sydney (AET)'),       short: tr('雪梨', 'Sydney') },
];

export function getTimezoneShortLabel(value: string): string {
  return TIMEZONE_OPTIONS.find((o) => o.value === value)?.short ?? value;
}
