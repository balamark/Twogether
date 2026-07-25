// 三個溝通原則的單一事實來源（設計理念）。
//
// Twogether 幫伴侶溝通的三個核心設計理念。它們其實早就長在 App 的 AI 機制裡
// （情緒翻譯、送出前情緒檢測、負向循環偵測、「說開一件事」的書寫流程），
// 這份檔案把它們命名、講清楚，讓三個曝光面吃同一份文案：
//   - 包裝：README「我們怎麼幫你溝通」小節
//   - 使用說明：HelpView 的「設計理念」區塊
//   - 推廣頁：LoggedOutPreview 的 CommunicationPrinciples 區塊
//
// 文案原則見 docs/UX_PLAYBOOK.md §R2：先講對感情的價值再講功能、稱「你／
// 另一半／TA」、衝突文案不評對錯、不用破折號。命名採「溫暖白話標題 + 概念小標」。
//
// 對應功能地圖（給維護者）：
//   iceberg → 情緒翻譯 MessageTranslationCard、送出前情緒檢測 DraftEmotionMeter
//   pattern → 負向循環 cycle（TherapyNoteCard）、跨衝突「溝通模式」視角（分析頁）
//   writing → 「說開一件事」EventsView / 我們的牆 WallView / ConflictView 用文字聊

import { Waves, Repeat, PenLine, type LucideIcon } from 'lucide-react';

export interface CommunicationPrinciple {
  id: 'iceberg' | 'pattern' | 'writing';
  /** 圖示。 */
  icon: LucideIcon;
  /** 概念小標：冰山 / 模式 / 書寫。 */
  conceptTag: string;
  /** 溫暖白話標題。 */
  title: string;
  /** 「如果你也常常⋯」——先讓人在困境裡認出自己。 */
  struggle: string;
  /** Twogether 怎麼幫（不評對錯、無破折號）。 */
  help: string;
  /** 對應的既有功能，讓文案可以連進去。 */
  feature: { view: string; label: string };
}

export const COMMUNICATION_PRINCIPLES: CommunicationPrinciple[] = [
  {
    id: 'iceberg',
    icon: Waves,
    conceptTag: '冰山',
    title: '說出口的，往往只是冰山一角',
    struggle:
      '明明在氣一件小事，真正在意的卻說不出口；對方也只聽到指責，沒聽到底下的需要。',
    help: '幫你看見話語底下的情緒與需求，把「你都不在乎」翻成「我需要被重視」，讓對方聽到的是需要，不是攻擊。',
    feature: { view: 'wall', label: '情緒翻譯' },
  },
  {
    id: 'pattern',
    icon: Repeat,
    conceptTag: '模式',
    title: '看見你們反覆卡住的那個循環',
    struggle:
      '一方一開口就像在攻擊，另一方立刻築起防禦，然後越吵越高；就算話說得很理性，底下也可能藏著酸。',
    help: '像中立的第三方，幫你們認出反覆出現的循環（追問、退縮、追得更急、更加沉默），也點出理性包裝下的酸味，讓你們一起跳出來，而不是繼續加碼。',
    feature: { view: 'events', label: '溝通模式' },
  },
  {
    id: 'writing',
    icon: PenLine,
    conceptTag: '書寫',
    title: '用寫的，把話說對',
    struggle:
      '說者無心、聽者有意；當下脫口而出的話常常詞不達意，反而造成本來沒有的傷害。',
    help: '先寫下來，AI 幫你把話整理成對方聽得進去的版本，改到滿意再送出。急切的話留到明天，傷害留在草稿裡。',
    feature: { view: 'events', label: '說開一件事' },
  },
];

export function getPrinciple(
  id: CommunicationPrinciple['id'],
): CommunicationPrinciple | null {
  return COMMUNICATION_PRINCIPLES.find((p) => p.id === id) || null;
}
