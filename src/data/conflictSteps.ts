import { tr } from '../i18n/tr';

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
    badge: tr('先停一下', 'Pause first'),
    title: tr('先停下來，不要反擊、不要解釋', 'Stop first. Don\'t fight back, don\'t explain'),
    why: tr('我在情緒裡時真的聽不進去，越解釋我越受傷。先別急著講道理、辯解或繼續講你的觀點。', 'When I\'m upset I really can\'t take it in, and the more you explain, the more it hurts. Don\'t rush to reason, defend yourself or keep making your point.'),
    cardClass: 'bg-sky-50/60 border-sky-200',
    badgeClass: 'text-sky-800 bg-sky-100/80',
    phrases: [
      tr('好，我先停一下。我想理解你的感受。', 'Okay, I\'ll pause. I want to understand how you feel.'),
      tr('我知道你現在不舒服，我先陪你。', 'I know you\'re not okay right now. I\'m here with you.'),
      tr('我們不急著講完，我先聽你。', 'We don\'t have to finish this now. I\'ll listen first.'),
    ],
    note: tr('你越快停下，我越快冷靜 — 這是降溫的第一步。', 'The sooner you stop, the sooner I calm down. That\'s the first step to cooling off.'),
  },
  {
    key: 'acknowledge',
    dot: '②',
    badge: tr('承認情緒', 'Acknowledge the feeling'),
    title: tr('用一句話承認我的情緒', 'Acknowledge my feeling in one sentence'),
    why: tr('一句話就能讓我冷靜一半。我不是要你認錯，是要你讓我覺得：你「有看見我」。', 'One sentence can calm me halfway. I\'m not asking you to admit fault; I need to feel that you see me.'),
    cardClass: 'bg-amber-50/70 border-amber-200',
    badgeClass: 'text-amber-900 bg-amber-100/80',
    phrases: [
      tr('我知道我剛剛的話讓你受傷了。', 'I know what I just said hurt you.'),
      tr('我看得出來你現在不開心。', 'I can see you\'re upset right now.'),
      tr('對，我的語氣太急了，我懂。', 'Yes, my tone was too sharp. I get it.'),
    ],
    note: tr('被看見，比被解釋更能讓我放下武裝。', 'Being seen disarms me more than being explained to.'),
  },
  {
    key: 'soften',
    dot: '③',
    badge: tr('語氣放軟', 'Soften your tone'),
    title: tr('語氣放軟，用溫柔代替強硬', 'Soften your tone; choose gentleness over force'),
    why: tr('內容可以一樣，但語氣要軟很多。我對情緒很敏感 — 語氣比內容還重要。', 'The content can stay the same, but the tone needs to be much softer. I\'m very sensitive to feelings; tone matters more than content.'),
    cardClass: 'bg-rose-50/60 border-rose-200',
    badgeClass: 'text-rose-800 bg-rose-100/80',
    phrases: [
      tr('你先別急，我在這裡。', 'Take your time, I\'m here.'),
      tr('寶貝，我不是對你生氣。', 'Babe, I\'m not angry at you.'),
      tr('我想先照顧你的感受，事情等等再說。', 'I want to take care of how you feel first. We can sort the rest out later.'),
    ],
    note: tr('同一句話，溫柔說 — 是完全不一樣的訊息。', 'The same words said gently send a completely different message.'),
  },
  {
    key: 'soothe',
    dot: '④',
    badge: tr('輕輕安撫', 'Comfort gently'),
    title: tr('給我一點點安撫 — 肢體或語言都好', 'Give me a little comfort, with a touch or with words'),
    why: tr('不一定要抱我，但一個輕柔的動作能讓我安心很多。', 'You don\'t have to hug me, but one gentle gesture makes me feel much safer.'),
    cardClass: 'bg-violet-50/60 border-violet-200',
    badgeClass: 'text-violet-800 bg-violet-100/80',
    phrases: [
      tr('我在，你先呼吸一下。', 'I\'m here. Take a breath first.'),
      tr('我牽你的手，好嗎？', 'Can I hold your hand?'),
      tr('讓我抱你一下，不用說話也可以。', 'Let me hug you for a bit. We don\'t have to talk.'),
    ],
    note: tr('一個小動作，常常比一千句解釋還有效。', 'A small gesture often works better than a thousand explanations.'),
  },
  {
    key: 'reassure',
    dot: '⑤',
    badge: tr('給我保證', 'Reassure me'),
    title: tr('保證一下：不是要吵架，是希望彼此更好', 'Reassure me: this isn\'t a fight, we want things to be better'),
    why: tr('一句保證，能讓我從戒備狀態裡放下來。', 'One reassurance helps me let my guard down.'),
    cardClass: 'bg-emerald-50/60 border-emerald-200',
    badgeClass: 'text-emerald-800 bg-emerald-100/80',
    phrases: [
      tr('我不是要跟你吵，我想靠近你。', 'I\'m not trying to fight with you. I want to be close to you.'),
      tr('我希望我們是一起的，不是對立的。', 'I want us to be on the same side, not against each other.'),
      tr('我想先把你的情緒接住，事情等等再談。', 'I want to hold your feelings first. We can talk about the rest later.'),
    ],
    note: tr('把方向定清楚 — 我們是同一隊，不是敵人。', 'Make the direction clear: we\'re on the same team, not enemies.'),
  },
  {
    key: 'step-down',
    dot: '⑥',
    badge: tr('給我台階', 'Give me a way back'),
    title: tr('給我一個台階 — 讓我知道你願意等', 'Give me a way back. Let me know you\'re willing to wait'),
    why: tr('有台階，我就會回頭。沒有台階，我只會越走越遠。', 'With a way back, I\'ll come around. Without one, I\'ll only drift further.'),
    cardClass: 'bg-orange-50/60 border-orange-200',
    badgeClass: 'text-orange-800 bg-orange-100/80',
    phrases: [
      tr('你先休息一下，等你準備好我就在這裡。', 'Take a break. I\'ll be here when you\'re ready.'),
      tr('你想等 10 分鐘再聊，還是等到我們都冷靜？', 'Do you want to talk in 10 minutes, or wait until we\'re both calm?'),
      tr('你先慢慢來，我陪你。', 'Take your time. I\'m with you.'),
    ],
    note: tr('願意等，比逼著解決更能打開門。', 'Being willing to wait opens the door more than pushing for a fix.'),
  },
  {
    key: 'tender',
    dot: '⑦',
    badge: tr('撒嬌靠近', 'Come close softly'),
    title: tr('撒嬌一點、軟軟地靠近我', 'Be a little sweet and come close to me softly'),
    why: tr('這對你來說可能很小，但對我來說常常是最有效的。', 'It may seem small to you, but for me it\'s often what works best.'),
    cardClass: 'bg-pink-50/60 border-pink-200',
    badgeClass: 'text-pink-800 bg-pink-100/80',
    phrases: [
      tr('我也會怕你生氣，我很在意你。', 'I get scared when you\'re angry too. I care about you a lot.'),
      tr('我想你了，過來一下嘛。', 'I miss you. Come here for a sec.'),
      tr('我希望你被我好好愛著。', 'I want you to feel well loved by me.'),
    ],
    note: tr('硬碰硬會兩敗俱傷 — 軟下來的人，才贏。', 'When both sides push hard, both get hurt. The one who softens wins.'),
  },
  {
    key: 'affirm',
    dot: '⑧',
    badge: tr('溫柔收尾', 'End gently'),
    title: tr('等我冷下來，用一句肯定句收尾', 'Once I\'ve calmed down, end with an affirming sentence'),
    why: tr('不要急著講道理或立場，先肯定我 — 我才真的有辦法聽進你的想法。', 'Don\'t rush into reasons or positions. Affirm me first, and then I can really hear what you think.'),
    cardClass: 'bg-stone-50 border-stone-300',
    badgeClass: 'text-stone-800 bg-stone-200/70',
    phrases: [
      tr('你對我很重要。', 'You\'re really important to me.'),
      tr('我希望你每天都很安心。', 'I want you to feel safe every day.'),
      tr('我很愛你，我不想你難過。', 'I love you so much. I don\'t want you to be sad.'),
    ],
    note: tr('先給情緒一個落腳的地方，事情再來談。', 'Give the feeling a place to land first, then talk about the issue.'),
  },
];
