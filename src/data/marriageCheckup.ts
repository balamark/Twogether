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
    label: '溝通',
    emoji: '💬',
    question: '這段時間，我們的溝通順暢嗎？',
    hint: '能不能好好把話說出口、也被聽見。',
  },
  {
    id: 'intimacy',
    label: '親密',
    emoji: '💗',
    question: '我們的情感與身體親密，讓我覺得滿足嗎？',
    hint: '擁抱、陪伴、性生活——你感受到的連結。',
  },
  {
    id: 'chores',
    label: '家務分工',
    emoji: '🏠',
    question: '家裡的分工，我覺得公平嗎？',
    hint: '誰做了什麼、會不會有人默默承擔太多。',
  },
  {
    id: 'finance',
    label: '金錢',
    emoji: '💰',
    question: '在金錢與消費上，我們是合拍的嗎？',
    hint: '花費、儲蓄、對未來的規劃有沒有共識。',
  },
  {
    id: 'support',
    label: '情緒支持',
    emoji: '🤝',
    question: '當我低落時，我覺得被另一半接住嗎？',
    hint: '需要的時候，對方在不在、懂不懂你。',
  },
  {
    id: 'future',
    label: '共同未來',
    emoji: '🌱',
    question: '對於我們的未來方向，我覺得我們是同一隊嗎？',
    hint: '目標、夢想、想一起走的方向。',
  },
];

// Two free-text reflections after the dimensions. The gratitude one is the
// heart of the check-up — it's where you notice what your partner does.
export const GRATITUDE_PROMPT = '這段時間，我想謝謝你做的這些事';
export const GRATITUDE_HINT = '具體一點——那些你習以為常、但其實對方一直在做的小事。';
export const ATTENTION_PROMPT = '我覺得我們最需要一起關注或改善的，是';
export const ATTENTION_HINT = '一件就好，挑你最在意的。';

export const SCORE_LABELS: Record<number, string> = {
  1: '很不滿意',
  2: '不太滿意',
  3: '普通',
  4: '滿意',
  5: '很滿意',
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
