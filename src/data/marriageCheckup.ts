import { tr } from '../i18n/tr';

// "婚姻檢查" (Marriage Check-up) questionnaire.
//
// Inspired by the research-backed "marriage check-up": once in a while, the
// couple honestly reviews the relationship with a neutral third party —
// what's working, what isn't, what needs attention — which improves intimacy
// and satisfaction. Part of why it helps: it forces each partner to notice
// what the other actually contributes.
//
// Each partner answers independently; answers are revealed side-by-side only
// once BOTH have submitted. Keep this list short enough to finish in one
// sitting. The dimension ids are the storage keys — server (AI prompt) and
// client share them, so don't rename without a migration of stored answers.

export interface CheckupDimension {
  id: string;
  label: string;
  emoji: string;
  question: string;
  hint: string;
}

export const CHECKUP_DIMENSIONS: CheckupDimension[] = [
  {
    id: 'communication',
    label: tr('溝通', 'Communication'),
    emoji: '💬',
    question: tr('這段時間，我們的溝通順暢嗎？', 'Lately, has our communication been going smoothly?'),
    hint: tr('能不能好好把話說出口、也被聽見。', 'Whether we can say what we mean, and feel heard.'),
  },
  {
    id: 'intimacy',
    label: tr('親密', 'Intimacy'),
    emoji: '💗',
    question: tr('我們的情感與身體親密，讓我覺得滿足嗎？', 'Does our emotional and physical intimacy feel fulfilling to me?'),
    hint: tr('擁抱、陪伴、性生活——你感受到的連結。', 'Hugs, time together, sex: the connection you feel.'),
  },
  {
    id: 'chores',
    label: tr('家務分工', 'Chores'),
    emoji: '🏠',
    question: tr('家裡的分工，我覺得公平嗎？', 'Does the way we split chores feel fair to me?'),
    hint: tr('誰做了什麼、會不會有人默默承擔太多。', 'Who does what, and whether someone is quietly carrying too much.'),
  },
  {
    id: 'finance',
    label: tr('金錢', 'Money'),
    emoji: '💰',
    question: tr('在金錢與消費上，我們是合拍的嗎？', 'Are we in sync about money and spending?'),
    hint: tr('花費、儲蓄、對未來的規劃有沒有共識。', 'Whether you agree on spending, saving and plans for the future.'),
  },
  {
    id: 'support',
    label: tr('情緒支持', 'Emotional support'),
    emoji: '🤝',
    question: tr('當我低落時，我覺得被另一半接住嗎？', 'When I\'m down, do I feel supported by my partner?'),
    hint: tr('需要的時候，對方在不在、懂不懂你。', 'Whether they\'re there for you, and understand you, when you need it.'),
  },
  {
    id: 'future',
    label: tr('共同未來', 'Shared future'),
    emoji: '🌱',
    question: tr('對於我們的未來方向，我覺得我們是同一隊嗎？', 'Do I feel we\'re on the same team about where we\'re heading?'),
    hint: tr('目標、夢想、想一起走的方向。', 'Goals, dreams, the direction you want to go together.'),
  },
];

// Two free-text reflections after the dimensions. The gratitude one is the
// heart of the check-up — it's where you notice what your partner does.
export const GRATITUDE_PROMPT = tr('這段時間，我想謝謝你做的這些事', 'Lately, I want to thank you for these things');
export const GRATITUDE_HINT = tr('具體一點——那些你習以為常、但其實對方一直在做的小事。', 'Be specific: the little things you take for granted but they keep doing.');
export const ATTENTION_PROMPT = tr('我覺得我們最需要一起關注或改善的，是', 'What I think we most need to focus on or improve together is');
export const ATTENTION_HINT = tr('一件就好，挑你最在意的。', 'Just one. Pick what matters most to you.');

export const SCORE_LABELS: Record<number, string> = {
  1: tr('很不滿意', 'Very dissatisfied'),
  2: tr('不太滿意', 'Somewhat dissatisfied'),
  3: tr('普通', 'Neutral'),
  4: tr('滿意', 'Satisfied'),
  5: tr('很滿意', 'Very satisfied'),
};

// The shape each partner submits / that comes back per response.
export interface CheckupAnswers {
  scores: Record<string, number>; // dimensionId -> 1..5
  notes: Record<string, string>; // dimensionId -> optional note
  gratitude: string;
  attention: string;
}

export function emptyCheckupAnswers(): CheckupAnswers {
  return { scores: {}, notes: {}, gratitude: '', attention: '' };
}
