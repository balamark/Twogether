// 8-step partner guide used by ConflictView (the standalone "和解步驟" page)
// and by the reply composer inside an event thread. Each step has 3 sample
// phrases the upset partner can tap to insert into their reply.

export interface ConflictStep {
  key: string;
  dot: string;
  badge: string;
  title: string;
  why: string;
  cardClass: string;
  badgeClass: string;
  phrases: string[];
  note: string;
}

export const conflictPhraseTiers: ConflictStep[] = [
  {
    key: 'pause',
    dot: '①',
    badge: '先停一下',
    title: '先停下來，不要反擊、不要解釋',
    why: '我在情緒裡時真的聽不進去，越解釋我越受傷。先別急著講道理、辯解或繼續講你的觀點。',
    cardClass: 'bg-sky-50/60 border-sky-200',
    badgeClass: 'text-sky-800 bg-sky-100/80',
    phrases: [
      '好，我先停一下。我想理解你的感受。',
      '我知道你現在不舒服，我先陪你。',
      '我們不急著講完，我先聽你。',
    ],
    note: '你越快停下，我越快冷靜 — 這是降溫的第一步。',
  },
  {
    key: 'acknowledge',
    dot: '②',
    badge: '承認情緒',
    title: '用一句話承認我的情緒',
    why: '一句話就能讓我冷靜一半。我不是要你認錯，是要你讓我覺得：你「有看見我」。',
    cardClass: 'bg-amber-50/70 border-amber-200',
    badgeClass: 'text-amber-900 bg-amber-100/80',
    phrases: [
      '我知道我剛剛的話讓你受傷了。',
      '我看得出來你現在不開心。',
      '對，我的語氣太急了，我懂。',
    ],
    note: '被看見，比被解釋更能讓我放下武裝。',
  },
  {
    key: 'soften',
    dot: '③',
    badge: '語氣放軟',
    title: '語氣放軟，用溫柔代替強硬',
    why: '內容可以一樣，但語氣要軟很多。我對情緒很敏感 — 語氣比內容還重要。',
    cardClass: 'bg-rose-50/60 border-rose-200',
    badgeClass: 'text-rose-800 bg-rose-100/80',
    phrases: [
      '你先別急，我在這裡。',
      '寶貝，我不是對你生氣。',
      '我想先照顧你的感受，事情等等再說。',
    ],
    note: '同一句話，溫柔說 — 是完全不一樣的訊息。',
  },
  {
    key: 'soothe',
    dot: '④',
    badge: '輕輕安撫',
    title: '給我一點點安撫 — 肢體或語言都好',
    why: '不一定要抱我，但一個輕柔的動作能讓我安心很多。',
    cardClass: 'bg-violet-50/60 border-violet-200',
    badgeClass: 'text-violet-800 bg-violet-100/80',
    phrases: [
      '我在，你先呼吸一下。',
      '我牽你的手，好嗎？',
      '讓我抱你一下，不用說話也可以。',
    ],
    note: '一個小動作，常常比一千句解釋還有效。',
  },
  {
    key: 'reassure',
    dot: '⑤',
    badge: '給我保證',
    title: '保證一下：不是要吵架，是希望彼此更好',
    why: '一句保證，能讓我從戒備狀態裡放下來。',
    cardClass: 'bg-emerald-50/60 border-emerald-200',
    badgeClass: 'text-emerald-800 bg-emerald-100/80',
    phrases: [
      '我不是要跟你吵，我想靠近你。',
      '我希望我們是一起的，不是對立的。',
      '我想先把你的情緒接住，事情等等再談。',
    ],
    note: '把方向定清楚 — 我們是同一隊，不是敵人。',
  },
  {
    key: 'step-down',
    dot: '⑥',
    badge: '給我台階',
    title: '給我一個台階 — 讓我知道你願意等',
    why: '有台階，我就會回頭。沒有台階，我只會越走越遠。',
    cardClass: 'bg-orange-50/60 border-orange-200',
    badgeClass: 'text-orange-800 bg-orange-100/80',
    phrases: [
      '你先休息一下，等你準備好我就在這裡。',
      '你想等 10 分鐘再聊，還是等到我們都冷靜？',
      '你先慢慢來，我陪你。',
    ],
    note: '願意等，比逼著解決更能打開門。',
  },
  {
    key: 'tender',
    dot: '⑦',
    badge: '撒嬌靠近',
    title: '撒嬌一點、軟軟地靠近我',
    why: '這對你來說可能很小，但對我來說常常是最有效的。',
    cardClass: 'bg-pink-50/60 border-pink-200',
    badgeClass: 'text-pink-800 bg-pink-100/80',
    phrases: [
      '我也會怕你生氣，我很在意你。',
      '我想你了，過來一下嘛。',
      '我希望你被我好好愛著。',
    ],
    note: '硬碰硬會兩敗俱傷 — 軟下來的人，才贏。',
  },
  {
    key: 'affirm',
    dot: '⑧',
    badge: '溫柔收尾',
    title: '等我冷下來，用一句肯定句收尾',
    why: '不要急著講道理或立場，先肯定我 — 我才真的有辦法聽進你的想法。',
    cardClass: 'bg-stone-50 border-stone-300',
    badgeClass: 'text-stone-800 bg-stone-200/70',
    phrases: [
      '你對我很重要。',
      '我希望你每天都很安心。',
      '我很愛你，我不想你難過。',
    ],
    note: '先給情緒一個落腳的地方，事情再來談。',
  },
];
