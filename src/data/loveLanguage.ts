import { tr } from '../i18n/tr';

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
    label: tr('肯定的言語', 'Words of affirmation'),
    emoji: '💬',
    tagline: tr('一句真誠的稱讚，勝過千言萬語', 'One sincere compliment says more than a thousand words'),
    description: tr('你最珍惜被肯定、被鼓勵的話語。真誠的稱讚、感謝與「我以你為傲」會讓你充滿能量。', 'You treasure words of affirmation and encouragement. Sincere compliments, thanks and "I\'m proud of you" fill you with energy.'),
    partnerTip: tr('多用言語表達欣賞與感謝：具體地稱讚 TA、留一張小紙條、常說「謝謝你」和「我愛你」。', 'Express appreciation and thanks in words: compliment them specifically, leave a little note, often say "thank you" and "I love you".'),
  },
  time: {
    code: 'time',
    label: tr('精心的相處', 'Quality time'),
    emoji: '⏳',
    tagline: tr('把心放在我身上的每一刻', 'Every moment your heart is with me'),
    description: tr('你最在意全心全意、不被打擾的相處。放下手機、專心地陪伴與深聊，會讓你感到被愛。', 'You care most about wholehearted, undistracted time together. Putting the phone down, being present and talking deeply makes you feel loved.'),
    partnerTip: tr('安排不被打擾的兩人時光：放下手機、專心聊天或一起做一件事，品質比時間長短更重要。', 'Plan undisturbed time for two: phones down, really talking or doing something together. Quality matters more than length.'),
  },
  gifts: {
    code: 'gifts',
    label: tr('收到禮物', 'Receiving gifts'),
    emoji: '🎁',
    tagline: tr('你記得我，就是最好的禮物', 'Remembering me is the best gift'),
    description: tr('你重視「被放在心上」的象徵。用心挑選的小禮物，代表對方有想著你，這份心意最打動你。', 'You value signs that you\'re "on their mind". A thoughtfully chosen little gift means they were thinking of you, and that touches you most.'),
    partnerTip: tr('不必昂貴，重在用心：記得 TA 隨口提過想要的東西，在小日子帶個驚喜，附上一句話。', 'It doesn\'t have to be expensive, just thoughtful: remember something they mentioned wanting, bring a surprise on an ordinary day, add a note.'),
  },
  service: {
    code: 'service',
    label: tr('服務的行動', 'Acts of service'),
    emoji: '🤝',
    tagline: tr('行動，是看得見的愛', 'Action is love you can see'),
    description: tr('你最感動於對方用行動分擔與付出。主動幫忙、解決你的麻煩，比說再多都更讓你安心。', 'You\'re most moved when your partner shares the load. Helping out and solving your problems reassures you more than any words.'),
    partnerTip: tr('主動分擔 TA 的負擔：搶著做家事、處理 TA 怕麻煩的事，做之前先問「我可以幫你什麼？」', 'Take something off their plate: jump in on chores, handle the things they dread, and ask first, "How can I help?"'),
  },
  touch: {
    code: 'touch',
    label: tr('身體的接觸', 'Physical touch'),
    emoji: '🤗',
    tagline: tr('靠近一點，我就安心', 'A little closer, and I feel safe'),
    description: tr('你透過肢體接觸感受愛。牽手、擁抱、依偎，這些溫暖的接觸讓你感到被珍惜與安全。', 'You feel love through touch. Holding hands, hugs and cuddling make you feel cherished and safe.'),
    partnerTip: tr('多一點溫柔的接觸：牽手、擁抱、看電視時靠著 TA，經過時拍拍肩，睡前抱一下。', 'More gentle touch: hold hands, hug, lean on them while watching TV, a pat on the shoulder as you pass, a hug before sleep.'),
  },
};

export const LOVE_LANGUAGE_ORDER: LoveLanguageCode[] = ['words', 'time', 'gifts', 'service', 'touch'];

// Five default suggested actions per love language — concrete things one partner
// can do to make the other (whose top language is this) feel loved. Shown on top
// of the user's own custom 愛的行動 wishlist (coin-store style).
export const LOVE_ACTIONS: Record<LoveLanguageCode, string[]> = {
  words: [
    tr('每天對 TA 說一句具體的稱讚', 'Give them one specific compliment every day'),
    tr('寫一張小紙條表達感謝', 'Write a little note to say thank you'),
    tr('傳訊息說一句「我以你為傲」', 'Text them "I\'m proud of you"'),
    tr('當面肯定 TA 做得好的地方', 'Tell them in person what they did well'),
    tr('睡前說一句「謝謝你今天的陪伴」', 'Before bed, say "thank you for being with me today"'),
  ],
  time: [
    tr('安排一次不滑手機的兩人約會', 'Plan a phone-free date for two'),
    tr('每天留 15 分鐘專心聊聊彼此的一天', 'Spend 15 focused minutes a day talking about each other\'s day'),
    tr('一起做一件 TA 喜歡的事', 'Do something together that they love'),
    tr('週末安排一個小旅行或散步', 'Plan a little weekend trip or walk'),
    tr('認真聽 TA 說話，不打斷、不分心', 'Really listen to them, without interrupting or getting distracted'),
  ],
  gifts: [
    tr('帶一份 TA 隨口提過想要的小東西', 'Bring them a little something they mentioned wanting'),
    tr('在平凡的日子準備一個小驚喜', 'Prepare a small surprise on an ordinary day'),
    tr('手寫一張卡片，附上小禮物', 'Write a card by hand and add a little gift'),
    tr('記得 TA 愛吃的，下班帶回家', 'Remember their favorite food and bring it home after work'),
    tr('為紀念日準備用心挑選的禮物', 'Choose a thoughtful gift for your anniversary'),
  ],
  service: [
    tr('主動分擔一項 TA 不喜歡的家事', 'Take over a chore they dislike'),
    tr('幫 TA 處理一件拖很久的雜事', 'Handle an errand they\'ve been putting off'),
    tr('早起幫 TA 準備早餐', 'Get up early and make them breakfast'),
    tr('在 TA 累的時候說「交給我」', 'When they\'re tired, say "leave it to me"'),
    tr('接送 TA，省去奔波的麻煩', 'Drive them so they don\'t have to rush around'),
  ],
  touch: [
    tr('出門前給 TA 一個擁抱', 'Hug them before you head out'),
    tr('看電視時靠著 TA、手牽手', 'Lean on them and hold hands while watching TV'),
    tr('經過時拍拍肩、摸摸頭', 'Pat their shoulder or ruffle their hair as you pass'),
    tr('睡前抱一下再入睡', 'Hug before falling asleep'),
    tr('走在路上自然地牽起 TA 的手', 'Take their hand naturally when you\'re out walking'),
  ],
};

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
  { id: 1, prompt: tr('哪一個更讓你感覺被愛？', 'Which makes you feel more loved?'), options: [
    { code: 'words', text: tr('聽到 TA 真誠地稱讚、肯定我', 'Hearing them sincerely compliment and affirm me') },
    { code: 'time', text: tr('TA 放下手機，專心地陪我', 'Them putting the phone down to be fully with me') },
  ] },
  { id: 2, prompt: tr('辛苦了一天，你更希望 TA…', 'After a long day, you\'d rather they…'), options: [
    { code: 'service', text: tr('主動把晚餐和家事都打理好', 'Took care of dinner and the chores') },
    { code: 'touch', text: tr('給我一個長長的擁抱', 'Gave me a long hug') },
  ] },
  { id: 3, prompt: tr('哪一種驚喜更打動你？', 'Which surprise moves you more?'), options: [
    { code: 'gifts', text: tr('收到一個 TA 用心挑的小禮物', 'A little gift they chose thoughtfully') },
    { code: 'words', text: tr('收到一段 TA 寫給我的真心話', 'A heartfelt message they wrote to me') },
  ] },
  { id: 4, prompt: tr('週末你更想要…', 'On the weekend, you\'d rather have…'), options: [
    { code: 'time', text: tr('兩個人不被打擾地相處一整天', 'A whole day together, undisturbed') },
    { code: 'service', text: tr('TA 幫我把煩人的雜事都解決掉', 'Them sorting out all my annoying errands') },
  ] },
  { id: 5, prompt: tr('哪個小舉動讓你更窩心？', 'Which little gesture warms you more?'), options: [
    { code: 'touch', text: tr('走在路上 TA 自然地牽起我的手', 'Them taking my hand naturally as we walk') },
    { code: 'gifts', text: tr('TA 經過時順手帶了我愛吃的東西', 'Them bringing home something I love to eat') },
  ] },
  { id: 6, prompt: tr('你做了一件很棒的事，最希望 TA…', 'When you\'ve done something great, you most want them to…'), options: [
    { code: 'words', text: tr('大方地說「我好以你為傲」', 'Say proudly, "I\'m so proud of you"') },
    { code: 'service', text: tr('默默地幫我分擔接下來的工作', 'Quietly help me with the work ahead') },
  ] },
  { id: 7, prompt: tr('想念對方時，你更渴望…', 'When you miss them, you long more for…'), options: [
    { code: 'time', text: tr('好好坐下來聊聊彼此的近況', 'Sitting down to really catch up') },
    { code: 'touch', text: tr('依偎在一起，什麼都不用說', 'Cuddling up without needing to say anything') },
  ] },
  { id: 8, prompt: tr('哪個更能讓你感到被重視？', 'Which makes you feel more valued?'), options: [
    { code: 'gifts', text: tr('TA 記得我隨口提過想要的東西', 'They remembered something I mentioned wanting') },
    { code: 'service', text: tr('TA 主動處理了我一直拖著的麻煩', 'They took care of a hassle I\'d been putting off') },
  ] },
  { id: 9, prompt: tr('心情低落時，你最需要的是…', 'When you\'re feeling low, you most need…'), options: [
    { code: 'words', text: tr('TA 溫柔地鼓勵我、肯定我', 'Them encouraging and affirming me gently') },
    { code: 'touch', text: tr('TA 緊緊抱著我', 'Them holding me tight') },
  ] },
  { id: 10, prompt: tr('哪一種紀念日更讓你感動？', 'Which kind of anniversary moves you more?'), options: [
    { code: 'time', text: tr('一段只屬於我們的精心安排約會', 'A carefully planned date just for us') },
    { code: 'gifts', text: tr('一份藏著心意的禮物', 'A gift with a lot of heart behind it') },
  ] },
  { id: 11, prompt: tr('你更容易因為哪件事覺得被愛？', 'What makes you feel loved more easily?'), options: [
    { code: 'service', text: tr('TA 為我做了很實際的事', 'They did something really practical for me') },
    { code: 'words', text: tr('TA 對我說了很暖心的話', 'They said something really warm to me') },
  ] },
  { id: 12, prompt: tr('一起看電影時，你更喜歡…', 'When watching a movie together, you prefer…'), options: [
    { code: 'touch', text: tr('靠著 TA、手牽著手', 'Leaning on them, holding hands') },
    { code: 'time', text: tr('全程專心陪伴、結束後一起聊', 'Their full attention, then talking about it afterward') },
  ] },
  { id: 13, prompt: tr('哪個更讓你覺得被放在心上？', 'Which makes you feel more on their mind?'), options: [
    { code: 'gifts', text: tr('TA 出差時帶了當地的小禮物給我', 'They brought me a little gift from a business trip') },
    { code: 'touch', text: tr('TA 一回到家就先抱抱我', 'They hug me first thing when they get home') },
  ] },
  { id: 14, prompt: tr('哪一句／哪一樣更打動你？', 'Which line or thing moves you more?'), options: [
    { code: 'words', text: tr('「有你真好，謝謝你一直都在」', '"I\'m so glad I have you. Thank you for always being here"') },
    { code: 'gifts', text: tr('一個寫著我名字的手作小禮', 'A handmade little gift with my name on it') },
  ] },
  { id: 15, prompt: tr('理想的相處是…', 'Ideal time together is…'), options: [
    { code: 'service', text: tr('TA 用行動讓我的生活更輕鬆', 'They make my life easier through what they do') },
    { code: 'time', text: tr('TA 願意花時間，全心全意陪我', 'They\'re willing to spend time with me, wholeheartedly') },
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
