// 愛的語言 (Gary Chapman's 5 Love Languages) — definitions, a quick forced-choice
// quiz, and scoring. Kept data-only so the view stays simple and future quizzes
// (MBTI, 星座) can follow the same shape.

export type LoveLanguageCode = 'words' | 'time' | 'gifts' | 'service' | 'touch';

export interface LoveLanguageMeta {
  code: LoveLanguageCode;
  label: string;
  emoji: string;
  tagline: string;
  description: string;
  /** How to love a partner whose top language is this one. */
  partnerTip: string;
}

export const LOVE_LANGUAGES: Record<LoveLanguageCode, LoveLanguageMeta> = {
  words: {
    code: 'words',
    label: '肯定的言語',
    emoji: '💬',
    tagline: '一句真誠的稱讚，勝過千言萬語',
    description: '你最珍惜被肯定、被鼓勵的話語。真誠的稱讚、感謝與「我以你為傲」會讓你充滿能量。',
    partnerTip: '多用言語表達欣賞與感謝：具體地稱讚 TA、留一張小紙條、常說「謝謝你」和「我愛你」。',
  },
  time: {
    code: 'time',
    label: '精心的相處',
    emoji: '⏳',
    tagline: '把心放在我身上的每一刻',
    description: '你最在意全心全意、不被打擾的相處。放下手機、專心地陪伴與深聊，會讓你感到被愛。',
    partnerTip: '安排不被打擾的兩人時光：放下手機、專心聊天或一起做一件事，品質比時間長短更重要。',
  },
  gifts: {
    code: 'gifts',
    label: '收到禮物',
    emoji: '🎁',
    tagline: '你記得我，就是最好的禮物',
    description: '你重視「被放在心上」的象徵。用心挑選的小禮物，代表對方有想著你，這份心意最打動你。',
    partnerTip: '不必昂貴，重在用心：記得 TA 隨口提過想要的東西，在小日子帶個驚喜，附上一句話。',
  },
  service: {
    code: 'service',
    label: '服務的行動',
    emoji: '🤝',
    tagline: '行動，是看得見的愛',
    description: '你最感動於對方用行動分擔與付出。主動幫忙、解決你的麻煩，比說再多都更讓你安心。',
    partnerTip: '主動分擔 TA 的負擔：搶著做家事、處理 TA 怕麻煩的事，做之前先問「我可以幫你什麼？」',
  },
  touch: {
    code: 'touch',
    label: '身體的接觸',
    emoji: '🤗',
    tagline: '靠近一點，我就安心',
    description: '你透過肢體接觸感受愛。牽手、擁抱、依偎，這些溫暖的接觸讓你感到被珍惜與安全。',
    partnerTip: '多一點溫柔的接觸：牽手、擁抱、看電視時靠著 TA，經過時拍拍肩，睡前抱一下。',
  },
};

export const LOVE_LANGUAGE_ORDER: LoveLanguageCode[] = ['words', 'time', 'gifts', 'service', 'touch'];

export interface QuizOption {
  code: LoveLanguageCode;
  text: string;
}
export interface QuizQuestion {
  id: number;
  prompt: string;
  options: [QuizOption, QuizOption];
}

// 15 forced-choice questions, balanced so each language appears 6 times.
export const LOVE_LANGUAGE_QUIZ: QuizQuestion[] = [
  { id: 1, prompt: '哪一個更讓你感覺被愛？', options: [
    { code: 'words', text: '聽到 TA 真誠地稱讚、肯定我' },
    { code: 'time', text: 'TA 放下手機，專心地陪我' },
  ] },
  { id: 2, prompt: '辛苦了一天，你更希望 TA…', options: [
    { code: 'service', text: '主動把晚餐和家事都打理好' },
    { code: 'touch', text: '給我一個長長的擁抱' },
  ] },
  { id: 3, prompt: '哪一種驚喜更打動你？', options: [
    { code: 'gifts', text: '收到一個 TA 用心挑的小禮物' },
    { code: 'words', text: '收到一段 TA 寫給我的真心話' },
  ] },
  { id: 4, prompt: '週末你更想要…', options: [
    { code: 'time', text: '兩個人不被打擾地相處一整天' },
    { code: 'service', text: 'TA 幫我把煩人的雜事都解決掉' },
  ] },
  { id: 5, prompt: '哪個小舉動讓你更窩心？', options: [
    { code: 'touch', text: '走在路上 TA 自然地牽起我的手' },
    { code: 'gifts', text: 'TA 經過時順手帶了我愛吃的東西' },
  ] },
  { id: 6, prompt: '你做了一件很棒的事，最希望 TA…', options: [
    { code: 'words', text: '大方地說「我好以你為傲」' },
    { code: 'service', text: '默默地幫我分擔接下來的工作' },
  ] },
  { id: 7, prompt: '想念對方時，你更渴望…', options: [
    { code: 'time', text: '好好坐下來聊聊彼此的近況' },
    { code: 'touch', text: '依偎在一起，什麼都不用說' },
  ] },
  { id: 8, prompt: '哪個更能讓你感到被重視？', options: [
    { code: 'gifts', text: 'TA 記得我隨口提過想要的東西' },
    { code: 'service', text: 'TA 主動處理了我一直拖著的麻煩' },
  ] },
  { id: 9, prompt: '心情低落時，你最需要的是…', options: [
    { code: 'words', text: 'TA 溫柔地鼓勵我、肯定我' },
    { code: 'touch', text: 'TA 緊緊抱著我' },
  ] },
  { id: 10, prompt: '哪一種紀念日更讓你感動？', options: [
    { code: 'time', text: '一段只屬於我們的精心安排約會' },
    { code: 'gifts', text: '一份藏著心意的禮物' },
  ] },
  { id: 11, prompt: '你更容易因為哪件事覺得被愛？', options: [
    { code: 'service', text: 'TA 為我做了很實際的事' },
    { code: 'words', text: 'TA 對我說了很暖心的話' },
  ] },
  { id: 12, prompt: '一起看電影時，你更喜歡…', options: [
    { code: 'touch', text: '靠著 TA、手牽著手' },
    { code: 'time', text: '全程專心陪伴、結束後一起聊' },
  ] },
  { id: 13, prompt: '哪個更讓你覺得被放在心上？', options: [
    { code: 'gifts', text: 'TA 出差時帶了當地的小禮物給我' },
    { code: 'touch', text: 'TA 一回到家就先抱抱我' },
  ] },
  { id: 14, prompt: '哪一句／哪一樣更打動你？', options: [
    { code: 'words', text: '「有你真好，謝謝你一直都在」' },
    { code: 'gifts', text: '一個寫著我名字的手作小禮' },
  ] },
  { id: 15, prompt: '理想的相處是…', options: [
    { code: 'service', text: 'TA 用行動讓我的生活更輕鬆' },
    { code: 'time', text: 'TA 願意花時間，全心全意陪我' },
  ] },
];

export type LoveLanguageScores = Record<LoveLanguageCode, number>;

export function emptyScores(): LoveLanguageScores {
  return { words: 0, time: 0, gifts: 0, service: 0, touch: 0 };
}

// Returns the winning code; ties broken by LOVE_LANGUAGE_ORDER for determinism.
export function topLanguage(scores: LoveLanguageScores): LoveLanguageCode {
  return LOVE_LANGUAGE_ORDER.reduce((best, code) =>
    scores[code] > scores[best] ? code : best
  , LOVE_LANGUAGE_ORDER[0]);
}
