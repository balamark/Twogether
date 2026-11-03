import { tr } from '../i18n/tr';
import { getEmotionAcceptance } from '../data/emotionAcceptance';

// ─── 說之前，先看看 (local, no-AI) ──────────────────────────────────────────
// A deterministic, on-device version of the logged-in emotion meter for the
// guest playground. It never calls the server or the LLM (the playground's
// privacy promise: your words stay in this tab). It reads the "temperature"
// of a sentence from keyword cues and returns the feelings underneath, how the
// partner is likely to hear it, and a softer I-statement to send instead.
// The signed-in AI version is far more nuanced — this is the taste, not the meal.

export interface SoftenEmotion {
  /** Stable key from data/emotionAcceptance (a logic value — never translate). */
  key: string;
  emoji: string;
  label: string;
  intensity: number;
}

export interface SoftenResult {
  emotions: SoftenEmotion[];
  /** 0–100: how "loaded" the original sounds. */
  heat: number;
  /** 0–100: the rewrite's heat, for the before → after meter. */
  heatAfter: number;
  partnerHears: string;
  need: string;
  rewrite: string;
  /** How to receive this feeling if the partner said it to you. */
  receiveLines: string[];
}

interface Rule {
  key: string;
  emoji: string;
  label: string;
  cues: string[];
  need: string;
  rewrite: string;
}

const RULES: Rule[] = [
  {
    key: '被忽視', emoji: '📵', label: tr('被忽視', 'Ignored'),
    cues: ['不回', '已讀', '不理', '不在乎', '沒在聽', '不聽', '忽略', 'text back', 'ignore', "don't care", 'not listening', 'reply'],
    need: tr('被放在心上、被回應', 'To be on their mind and get a response'),
    rewrite: tr('我傳訊息沒等到回覆的時候，會覺得自己好像不被放在心上。下次如果會晚，可以先跟我說一聲嗎？', 'When my messages go unanswered, I start to feel like I\'m not on your mind. Next time you\'re running late, could you give me a quick heads-up?'),
  },
  {
    key: '失望', emoji: '🌧️', label: tr('失望', 'Disappointed'),
    cues: ['說好', '答應', '結果', '又沒', '明明', 'promised', 'said you would', "you'd", 'supposed to'],
    need: tr('約定被重視', 'For promises to matter'),
    rewrite: tr('我們說好的事沒做到，我心裡有點失落，因為我很期待和你在一起的時間。可以一起想想下次怎麼做嗎？', 'When what we agreed on doesn\'t happen, I feel let down, because I really look forward to our time. Can we figure out together how to make it work next time?'),
  },
  {
    key: '憤怒', emoji: '😠', label: tr('憤怒', 'Anger'),
    cues: ['每次', '總是', '又', '受夠', '氣死', '煩死', '到底', 'always', 'every time', 'again', 'sick of', 'fed up'],
    need: tr('被認真對待', 'To be taken seriously'),
    rewrite: tr('我現在有點生氣，想先冷靜一下。等一下我想好好跟你說，我真正在意的是什麼。', 'I\'m pretty angry right now and want to cool down first. In a bit, I\'d like to tell you properly what I really care about here.'),
  },
  {
    key: '委屈', emoji: '🥺', label: tr('委屈', 'Unappreciated'),
    cues: ['都是我', '我做', '為你', '付出', '憑什麼', 'i do everything', 'always me', 'i did', 'for you'],
    need: tr('付出被看見', 'For their effort to be seen'),
    rewrite: tr('我覺得我做的那些好像沒被看見，心裡有點委屈。可以聽我說說，這陣子我在撐些什麼嗎？', 'I feel like what I do isn\'t being seen, and it stings. Could you hear me out about what I\'ve been carrying lately?'),
  },
  {
    key: '心累', emoji: '😮‍💨', label: tr('心累', 'Worn out'),
    cues: ['算了', '隨便', '累', '懶得', '無所謂', 'forget it', 'whatever', 'tired', 'exhausted', 'never mind'],
    need: tr('被陪伴、被分擔', 'Company and a shared load'),
    rewrite: tr('我最近真的很累，剛剛那句話其實是累出來的。我需要的是你陪我一下，不是解決問題。', 'I\'ve been really worn out, and that came out of tiredness. What I need is for you to be with me for a bit, not to fix it.'),
  },
  {
    key: '孤單', emoji: '🫥', label: tr('孤單', 'Lonely'),
    cues: ['一個人', '沒人', '自己來', '都不陪', 'alone', 'by myself', 'on my own', 'nobody'],
    need: tr('連結與陪伴', 'Connection and company'),
    rewrite: tr('最近我常覺得自己一個人在撐，有點孤單。我們可以找一天，只屬於我們兩個人的時間嗎？', 'Lately I often feel like I\'m holding things up alone, and it\'s lonely. Could we find a day that\'s just for the two of us?'),
  },
  {
    key: '焦慮', emoji: '😟', label: tr('焦慮', 'Anxious'),
    cues: ['擔心', '怕', '是不是', '會不會', '怎麼辦', 'worried', 'scared', 'what if', 'are you'],
    need: tr('安心與確定感', 'Reassurance'),
    rewrite: tr('我有點擔心，腦袋會一直往最壞的方向想。你可以跟我說說你的想法，讓我安心一點嗎？', 'I\'m a bit worried, and my mind keeps jumping to the worst. Could you tell me what you\'re thinking so I can feel steadier?'),
  },
  {
    key: '受傷', emoji: '💔', label: tr('受傷', 'Hurt'),
    cues: ['你根本', '從來', '傷', '難過', '過分', 'you never', 'hurt', 'how could', 'never'],
    need: tr('被溫柔對待', 'To be treated gently'),
    rewrite: tr('剛剛那件事讓我很受傷。我不是要吵架，只是想讓你知道，它對我來說很重要。', 'That really hurt me. I\'m not trying to fight. I just want you to know it matters to me.'),
  },
];

const FALLBACK: Rule = {
  key: '複雜情緒', emoji: '🌫️', label: tr('複雜情緒', 'Mixed feelings'),
  cues: [],
  need: tr('先被理解，再談解決', 'To be understood before solving anything'),
  rewrite: tr('我現在心裡有點亂，說不太清楚。可以先陪我一下，等我整理好再一起聊嗎？', 'I\'m a bit jumbled inside and can\'t quite put it into words. Could you stay with me for a bit, and we talk once I\'ve sorted it out?'),
};

// Words that turn a complaint into a verdict about the person.
const ABSOLUTES = ['每次', '總是', '從來', '根本', '永遠', 'always', 'never', 'every time'];

function countHits(text: string, cues: string[]): number {
  let n = 0;
  for (const c of cues) {
    if (!c) continue;
    let from = 0;
    for (;;) {
      const i = text.indexOf(c, from);
      if (i < 0) break;
      n += 1;
      from = i + c.length;
    }
  }
  return n;
}

export function analyzeSoften(input: string): SoftenResult {
  const text = input.trim().toLowerCase();
  const scored = RULES
    .map((r) => ({ r, hits: countHits(text, r.cues) }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  const top = scored.slice(0, 3);
  const emotions: SoftenEmotion[] = (top.length ? top : [{ r: FALLBACK, hits: 1 }]).map(({ r, hits }, i) => ({
    key: r.key,
    emoji: r.emoji,
    label: r.label,
    intensity: Math.min(95, 45 + hits * 15 - i * 10),
  }));

  const absolutes = countHits(text, ABSOLUTES);
  const bangs = countHits(text, ['!', '！', '?!', '？！']);
  const startsWithYou = /^(你|you\b)/.test(text);
  const heat = Math.max(15, Math.min(98, 25 + absolutes * 18 + bangs * 8 + (startsWithYou ? 12 : 0) + scored.length * 6));

  const partnerHears = absolutes > 0
    ? tr('「每次／總是」這類字會讓對方聽成「你這個人就是不好」，他會先忙著反駁那個「每次」，而聽不到你真正的在乎。', 'Words like "always / every time" sound like "you\'re just a bad person", so they\'ll rush to dispute the "always" and miss what you actually care about.')
    : startsWithYou
      ? tr('以「你」開頭，對方容易聽成指責，第一反應會是防衛或解釋。', 'Starting with "you" tends to land as blame, so their first reflex is to defend or explain.')
      : tr('語氣不算衝，但對方可能還是猜不到你需要什麼。把需要說出來，會更容易被接住。', 'It isn\'t harsh, but they may still not guess what you need. Saying the need out loud makes it easier to receive.');

  const main = top[0]?.r ?? FALLBACK;
  return {
    emotions,
    heat,
    heatAfter: Math.max(8, Math.round(heat * 0.22)),
    partnerHears,
    need: main.need,
    rewrite: main.rewrite,
    receiveLines: getEmotionAcceptance(main.key).sampleLines.slice(0, 2),
  };
}
