import { tr } from '../i18n/tr';

// The positive interactions that trigger an automatic 感情存款 deposit
// (server: lib/loveBankAuto.js AUTO_CATEGORIES — keep the keys in sync).
// Each person sets, in 設定, how much they deposit into the partner's account
// when the PARTNER does one of these; default 1, 0 = off.
export type LoveBankCategory = 'daily_love' | 'see_you' | 'secret' | 'wall_post' | 'love_moment' | 'conflict_resolved';

export const LOVE_BANK_CATEGORIES: { key: LoveBankCategory; emoji: string; label: string }[] = [
  { key: 'daily_love', emoji: '❤️', label: tr('今天你還喜歡他什麼', 'What do you still love about them today?') },
  { key: 'see_you', emoji: '👀', label: tr('我看見你', 'I see you') },
  { key: 'secret', emoji: '🎁', label: tr('他不知道的事', 'Things they don\'t know') },
  { key: 'wall_post', emoji: '📝', label: tr('在牆上留言', 'Leave a note on the wall') },
  { key: 'love_moment', emoji: '💗', label: tr('記錄一段美好時光', 'Record a good moment') },
  { key: 'conflict_resolved', emoji: '🤝', label: tr('一起化解一次衝突', 'Resolve a conflict together') },
];

export const loveBankCategoryLabel = (key: string | null): string =>
  LOVE_BANK_CATEGORIES.find((c) => c.key === key)?.label ?? tr('正向互動', 'A positive interaction');
