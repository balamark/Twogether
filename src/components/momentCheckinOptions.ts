import { tr } from '../i18n/tr';
import type { TimeSlot } from '../utils/intimacyStats';

// 感受小調查 options. Keys are what's stored and must match LIKED / TIMING in
// lib/momentCheckins.js; labels are bilingual UI copy only.

export const SATISFACTION_OPTIONS: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: '😕', label: tr('不太好', 'Not great') },
  { value: 2, emoji: '🙂', label: tr('普通', 'Okay') },
  { value: 3, emoji: '😊', label: tr('不錯', 'Good') },
  { value: 4, emoji: '😍', label: tr('很好', 'Great') },
  { value: 5, emoji: '🥰', label: tr('超棒', 'Amazing') },
];

export const LIKED_OPTIONS: { key: string; label: string }[] = [
  { key: 'atmosphere', label: tr('氣氛', 'Atmosphere') },
  { key: 'foreplay', label: tr('前戲', 'Foreplay') },
  { key: 'pace', label: tr('節奏', 'Pace') },
  { key: 'communication', label: tr('溝通', 'Communication') },
  { key: 'closeness', label: tr('親密感', 'Closeness') },
  { key: 'aftercare', label: tr('事後擁抱', 'Cuddles after') },
  { key: 'novelty', label: tr('新嘗試', 'Something new') },
  { key: 'place', label: tr('地點', 'The place') },
];

export const TIMING_OPTIONS: { key: string; label: string }[] = [
  { key: 'perfect', label: tr('剛剛好，下次也這個時間', 'Just right, same time next time') },
  { key: 'earlier', label: tr('早一點會更好', 'A bit earlier') },
  { key: 'later', label: tr('晚一點會更好', 'A bit later') },
  { key: 'weekend', label: tr('假日比較從容', 'Weekends feel easier') },
];

export const SLOT_LABELS: Record<TimeSlot, string> = {
  morning: tr('早上', 'Morning'),
  afternoon: tr('下午', 'Afternoon'),
  evening: tr('晚上', 'Evening'),
  night: tr('深夜', 'Late night'),
};

export const likedLabel = (key: string) => LIKED_OPTIONS.find((o) => o.key === key)?.label ?? key;
export const timingLabel = (key: string | null | undefined) => TIMING_OPTIONS.find((o) => o.key === key)?.label ?? null;
export const satisfactionMeta = (v: number | null | undefined) => SATISFACTION_OPTIONS.find((o) => o.value === v) ?? null;
