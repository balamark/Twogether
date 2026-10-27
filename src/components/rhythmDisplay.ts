import type { DayMood, IntimacyIntention } from '../services/api';
import { tr } from '../i18n/tr';

// ─── Shared rhythm visuals (also used by the calendar heatmap) ───────────────
// Level 1 (±5 days) … 6 (predicted ovulation). Darker AND taller as it gets
// closer, so shade is never the only cue; the day card spells it out in words.
export const RHYTHM_STRIP_BG: Record<number, string> = {
  1: 'bg-violet-300',
  2: 'bg-violet-400',
  3: 'bg-violet-500',
  4: 'bg-violet-600',
  5: 'bg-violet-700',
  6: 'bg-violet-800',
};
export const RHYTHM_STRIP_HEIGHT: Record<number, string> = {
  1: 'h-[2px]',
  2: 'h-[2px]',
  3: 'h-[3px]',
  4: 'h-[3px]',
  5: 'h-1',
  6: 'h-1.5',
};

// Relative position in words: 排卵前 2 天 / 預測排卵日 / 排卵後 3 天.
export function rhythmOffsetLabel(offset: number): string {
  if (offset === 0) return tr('預測排卵日', 'Predicted ovulation day');
  if (offset < 0) return tr(`排卵前 ${-offset} 天`, `${-offset} ${offset === -1 ? 'day' : 'days'} before ovulation`);
  return tr(`排卵後 ${offset} 天`, `${offset} ${offset === 1 ? 'day' : 'days'} after ovulation`);
}

// Keys are the stored values (never translated); labels are display only.
export const MOOD_OPTIONS: { key: DayMood; emoji: string; label: string }[] = [
  { key: 'great', emoji: '😊', label: tr('心情很好', 'Feeling great') },
  { key: 'good', emoji: '🙂', label: tr('心情還不錯', 'Feeling good') },
  { key: 'okay', emoji: '😐', label: tr('普普通通', 'So-so') },
  { key: 'low', emoji: '😔', label: tr('有點低落', 'A bit down') },
  { key: 'stressed', emoji: '😣', label: tr('壓力比較大', 'Quite stressed') },
];

export const INTENTION_OPTIONS: { key: IntimacyIntention; label: string }[] = [
  { key: 'want_intimacy', label: tr('想要親密互動', 'I\'d like to be intimate') },
  { key: 'start_with_cuddles', label: tr('可以先從擁抱、牽手開始', 'Let\'s start with hugs or holding hands') },
  { key: 'prefer_rest', label: tr('今天比較想休息', 'I\'d rather rest today') },
  { key: 'not_sure', label: tr('還不確定，看當下的感覺', 'Not sure yet, I\'ll see how I feel') },
  { key: 'prefer_not_say', label: tr('不想分享今天的狀態', 'I\'d rather not share today') },
];

