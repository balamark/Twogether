import { tr } from '../i18n/tr';

// Ranked single-player features shown in the guest tour (see GuestTutorial.tsx).
export interface GuestTourFeature {
  rank: number;
  emoji: string;
  title: string;
  hook: string;
  /** App view id the「去試試」button opens. */
  view: string;
}

export const GUEST_TOUR: GuestTourFeature[] = [
  { rank: 1, emoji: '🌡️', view: 'events', title: tr('說開一件事', 'Talk one thing through'), hook: tr('寫下那句差點送出的話，先看見底下的情緒，再換成對方聽得進去的說法。', 'Write the line you almost sent, see the feelings underneath, and get a version they can actually hear.') },
  { rank: 2, emoji: '💞', view: 'love-language', title: tr('愛的語言測驗', 'Love language quiz'), hook: tr('15 題、2 分鐘，找出你最容易「感覺被愛」的方式。', '15 questions, 2 minutes: find how you most easily feel loved.') },
  { rank: 3, emoji: '🌤️', view: 'calendar', title: tr('今日心情', 'Today\'s mood'), hook: tr('在月曆點一下今天，記下心情；兩週後就看得出自己的節奏。', 'Tap today on the calendar to log your mood; in two weeks you\'ll see your rhythm.') },
  { rank: 4, emoji: '📸', view: 'us', title: tr('記錄時光', 'Moments together'), hook: tr('把小確幸收進時間軸，吵架後翻一翻，想起為什麼在一起。', 'Collect little joys on a timeline; flip through it after a fight to remember why.') },
  { rank: 5, emoji: '🩹', view: 'conflict', title: tr('和解步驟', 'Make-up steps'), hook: tr('吵架時腦袋一片空白？8 個步驟、現成的句子，一鍵帶走。', 'Mind goes blank in a fight? 8 steps with ready-made lines.') },
];

