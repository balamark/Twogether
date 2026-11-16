import { tr } from '../../i18n/tr';
import type { RepairKind, RepairResponseKind } from '../../services/api';

// 回頭接住 — the copy for each repair kind / response. Keys are the values the
// server stores (routes/repair.js KINDS / RESPONSES); everything here is copy.
//
// The kinds follow the article this feature comes from (Gottman's repair
// attempt + emotional validation): the first and default one is validation —
// 「承認對方的情緒是可以被理解的」, which is NOT agreeing with their point of view.

export interface RepairKindCopy {
  kind: RepairKind;
  emoji: string;
  label: string;
  /** One line on why this works, shown under the chips. */
  why: string;
  /** Prefilled, editable. */
  template: string;
}

export const REPAIR_KINDS: RepairKindCopy[] = [
  {
    kind: 'validate',
    emoji: '🫶',
    label: tr('理解你的情緒', 'I get why you felt that'),
    why: tr('情緒驗證不是認同對方的觀點，而是承認：你會有那種感受，是可以理解的。', 'Validation isn\'t agreeing with their view. It\'s saying: it makes sense that you felt that way.'),
    template: tr('我想了一下，你那時會那麼生氣，其實是有原因的。', 'I\'ve been thinking — it makes sense that you got so upset back then.'),
  },
  {
    kind: 'thanks',
    emoji: '🍵',
    label: tr('你辛苦了', 'You\'ve had a lot on you'),
    why: tr('看見對方的辛苦，常常比講贏道理更能讓兩個人重新靠近。', 'Seeing how hard it\'s been for them often brings you closer than winning the argument.'),
    template: tr('剛剛吵完我冷靜下來想了想，你最近真的辛苦了。', 'Now that I\'ve calmed down — you\'ve really had a lot on you lately.'),
  },
  {
    kind: 'own_part',
    emoji: '🪞',
    label: tr('我也有我的部分', 'I had a part in it'),
    why: tr('只說自己的那一部分，不需要分誰對誰錯，也不需要一次講完。', 'Own just your part. No need to settle who was right, or to say it all at once.'),
    template: tr('剛剛我的語氣太衝了，那不是我想對你說話的方式。', 'My tone earlier was too harsh. That\'s not how I want to talk to you.'),
  },
  {
    kind: 'care',
    emoji: '💗',
    label: tr('我們還是同一隊', 'We\'re still on the same team'),
    why: tr('吵架的時候容易忘記：你們要對付的是問題，不是彼此。', 'In a fight it\'s easy to forget: you\'re up against the problem, not each other.'),
    template: tr('就算剛剛吵成那樣，我還是很在乎你，我們是同一隊的。', 'Even after that fight, I still care about you a lot. We\'re on the same team.'),
  },
  {
    kind: 'pause',
    emoji: '⏸️',
    label: tr('之後再好好談', 'Let\'s talk it through later'),
    why: tr('不想吵完就算了，但也還沒準備好談？先說好「我們會回來談」。', 'Not ready to talk yet, but don\'t want to just drop it? Agree that you\'ll come back to it.'),
    template: tr('那件事我還想跟你好好談，不是算了。等我們都比較平靜，找個時間再聊好嗎？', 'I still want to talk that through properly — I\'m not dropping it. Can we find a time once we\'re both calmer?'),
  },
  {
    kind: 'light',
    emoji: '🌤️',
    label: tr('輕輕的一句', 'Something light'),
    why: tr('一個笑容、一句玩笑，也是修復；只要對方感覺得到你在靠近。', 'A smile or a small joke is a repair too — as long as they can feel you moving closer.'),
    template: tr('休戰一下好嗎？我去買你喜歡的那個飲料 🧋', 'Truce for a bit? I\'ll go get your favourite drink 🧋'),
  },
];

export const repairKindCopy = (kind: RepairKind | null | undefined): RepairKindCopy =>
  REPAIR_KINDS.find((k) => k.kind === kind) || REPAIR_KINDS[0];

export interface RepairResponseCopy {
  response: RepairResponseKind;
  emoji: string;
  /** Button label for the recipient. */
  label: string;
  /** What the sender sees once the partner answered. */
  senderLine: (partner: string) => string;
}

export const REPAIR_RESPONSES: RepairResponseCopy[] = [
  {
    response: 'received',
    emoji: '💛',
    label: tr('被接住了', 'I feel understood'),
    senderLine: (p) => tr(`${p}說：被你接住了`, `${p} says: I feel understood`),
  },
  {
    response: 'talk',
    emoji: '💬',
    label: tr('謝謝，我也想說說我的', 'Thanks — I\'d like to share mine too'),
    senderLine: (p) => tr(`${p}想再和你聊聊`, `${p} would like to talk some more`),
  },
  {
    response: 'need_time',
    emoji: '🕊️',
    label: tr('收到了，我還需要一點時間', 'Got it — I need a little more time'),
    senderLine: (p) => tr(`${p}還需要一點時間。這不是拒絕，你已經踏出第一步了`, `${p} needs a little more time. That isn't a no — you've taken the first step`),
  },
];

export const repairResponseCopy = (response: RepairResponseKind | null | undefined) =>
  REPAIR_RESPONSES.find((r) => r.response === response) || null;

// On-device wording check — no AI, no quota, works the same in 訪客模式.
// Validation fails most often in one of three ways: a 「但是」 that takes it
// back, a turn back to what *they* did, or a shrug that closes the door.
// Patterns are matched against the user's own text; the hint is copy.
const WORDING_RULES: { re: RegExp; hint: string }[] = [
  {
    re: /(但是|可是|不過|只是你|\bbut\b|\bhowever\b)/i,
    hint: tr('「但是」後面那半句，常常會把前面的理解收回去。試試先只說前半句。', 'Whatever follows "but" tends to take back the understanding before it. Try sending just the first half.'),
  },
  {
    re: /(你也|你自己|你每次|你總是|你從來|要不是你|you always|you never|you also)/i,
    hint: tr('這句話轉回了對方做了什麼。修復的時候，先只說你看見的感受就好。', 'This turns back to what they did. For a repair, just name the feeling you see.'),
  },
  {
    re: /(算了|隨便|沒差|反正|whatever|forget it|never mind)/i,
    hint: tr('「算了」聽起來像把門關上。想先停下來，可以說「我們之後再好好談」。', '"Forget it" can sound like closing the door. If you need a pause, try "let\'s talk properly later".'),
  },
];

export function wordingHint(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  for (const rule of WORDING_RULES) {
    if (rule.re.test(t)) return rule.hint;
  }
  return null;
}

// 「冷靜後提醒我」 choices. Computed on the device so 「明天早上」 means the
// user's own morning; the server only checks the 10 min – 48 h window.
export interface RemindChoice {
  id: '1h' | '3h' | 'tomorrow';
  label: string;
  at: () => Date;
}

export const REMIND_CHOICES: RemindChoice[] = [
  { id: '1h', label: tr('1 小時後', 'In 1 hour'), at: () => new Date(Date.now() + 3600_000) },
  { id: '3h', label: tr('3 小時後', 'In 3 hours'), at: () => new Date(Date.now() + 3 * 3600_000) },
  {
    id: 'tomorrow',
    label: tr('明天早上', 'Tomorrow morning'),
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(8, 30, 0, 0);
      return d;
    },
  },
];
