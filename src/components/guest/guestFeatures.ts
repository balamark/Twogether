import { tr } from '../../i18n/tr';

// The guest playground's single-player features, ranked by how appealing they
// are to someone who just landed alone (no partner, no account). Ranking logic:
//   1. 說之前先看看 — instant "wow": paste the line you almost sent and watch the
//      heat drop. It's also the product's core differentiator (conflict repair).
//   2. 愛的語言測驗 — a 2-minute personality quiz with a shareable result; the
//      most universally appealing thing for a solo visitor.
//   3. 心情日記 — one tap a day, and a strip that shows your pattern; habit-forming.
//   4. 回憶時間軸 — collecting sweet moments is fun, but needs a bit of typing.
//   5. 和好小抄 — high value in the moment of a fight, lower appeal when calm.
// Keep this order in sync with the tutorial scenes (GuestTutorial).

export type GuestFeatureId = 'soften' | 'love-language' | 'mood' | 'memories' | 'repair';

export interface GuestFeatureMeta {
  id: GuestFeatureId;
  rank: number;
  emoji: string;
  title: string;
  hook: string;
}

export const GUEST_FEATURES: GuestFeatureMeta[] = [
  { id: 'soften', rank: 1, emoji: '🌡️', title: tr('說之前，先看看', 'Check it before you send it'), hook: tr('貼上差點送出的那句話，看見底下的情緒，換成對方聽得進去的說法。', 'Paste the line you almost sent, see the feelings underneath, and get a version they can actually hear.') },
  { id: 'love-language', rank: 2, emoji: '💞', title: tr('愛的語言測驗', 'Love language quiz'), hook: tr('15 題、2 分鐘，找出你最容易「感覺被愛」的方式。', '15 questions, 2 minutes: find how you most easily feel loved.') },
  { id: 'mood', rank: 3, emoji: '🌤️', title: tr('心情日記', 'Mood diary'), hook: tr('一天點一下，兩週後就看得出自己的情緒節奏。', 'One tap a day; in two weeks you\'ll see your own rhythm.') },
  { id: 'memories', rank: 4, emoji: '📸', title: tr('回憶時間軸', 'Memory timeline'), hook: tr('把小確幸收進時間軸，吵架時翻一翻就想起為什麼在一起。', 'Collect little joys on a timeline; flip through it after a fight to remember why.') },
  { id: 'repair', rank: 5, emoji: '🩹', title: tr('和好小抄', 'Make-up cheat sheet'), hook: tr('吵架時腦袋一片空白？8 個步驟、現成的句子，收藏你最需要的。', 'Mind goes blank in a fight? 8 steps with ready-made lines. Save the ones you need.') },
];
