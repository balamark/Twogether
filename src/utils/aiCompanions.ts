import { tr } from '../i18n/tr';

// Display data for the selectable AI 諮商師 companions. Mirrors the persona
// list in lib/aiCompanions.js (backend keeps prompts + validation; this file
// keeps user-facing copy). Ids must stay in sync with the backend list.

export interface AiCompanion {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  styles: string[];
  recommended?: boolean;
}

export const AI_COMPANIONS: AiCompanion[] = [
  {
    id: 'sophie',
    name: 'Sophie',
    emoji: '🕊️',
    tagline: tr('溫柔的傾聽者', 'The gentle listener'),
    description: tr('Sophie 會先建立情緒上的安全感。她在給建議之前，一定先接住你的感受，鼓勵你們對彼此坦露脆弱。', 'Sophie builds emotional safety first. Before any advice, she always holds your feelings, and encourages you both to be open about what\'s vulnerable.'),
    styles: [tr('溫暖', 'Warm'), tr('輕柔', 'Gentle'), tr('有同理心', 'Empathetic'), tr('不急著給解法', 'Doesn\'t rush to fix')],
  },
  {
    id: 'emma',
    name: 'Emma',
    emoji: '🌻',
    tagline: tr('鼓勵你的朋友', 'The encouraging friend'),
    description: tr('Emma 像一位真心希望你們幸福的好朋友，用日常的語言陪你們聊，為每一點進步喝采。', 'Emma is like a good friend who truly wants you to be happy. She talks with you in everyday language and cheers every bit of progress.'),
    styles: [tr('正向', 'Positive'), tr('安心', 'Reassuring'), tr('有盼望', 'Hopeful'), tr('用日常語言', 'Everyday language')],
  },
  {
    id: 'kai',
    name: 'Kai',
    emoji: '🧭',
    tagline: tr('務實的教練', 'The practical coach'),
    description: tr('Kai 專注於可行的下一步和健康的溝通習慣，給你們具體、清楚的建議。', 'Kai focuses on doable next steps and healthy communication habits, with clear, concrete advice.'),
    styles: [tr('直接', 'Direct'), tr('有條理', 'Structured'), tr('以解法為導向', 'Solution-focused'), tr('給具體建議', 'Concrete advice')],
  },
  {
    id: 'sage',
    name: 'Sage',
    emoji: '🌿',
    tagline: tr('睿智的引導者', 'The wise guide'),
    description: tr('Sage 幫你們看見更大的圖像，理解關係中一再出現的模式。', 'Sage helps you see the bigger picture and understand the patterns that keep coming back in your relationship.'),
    styles: [tr('沉穩', 'Grounded'), tr('深思', 'Thoughtful'), tr('有洞察', 'Insightful'), tr('培養自我覺察', 'Builds self-awareness')],
  },
  {
    id: 'ember',
    name: 'Ember',
    emoji: '🔥',
    tagline: tr('關係的加油者', 'The relationship cheerleader'),
    description: tr('Ember 帶著溫暖與樂觀，在對話變得疏離時，幫你們重新靠近彼此。', 'Ember brings warmth and optimism, helping you find your way back to each other when things feel distant.'),
    styles: [tr('有活力', 'Energetic'), tr('鼓舞人心', 'Uplifting'), tr('歌頌你們的愛', 'Celebrates your love'), tr('促進重新連結', 'Encourages reconnection')],
  },
  {
    id: 'aiko',
    name: 'Aiko',
    emoji: '🌸',
    tagline: tr('溫柔的和平使者', 'The gentle peacemaker'),
    description: tr('Aiko 幫衝突慢下來，創造讓雙方都感到被尊重的空間。', 'Aiko slows conflicts down and makes space where you both feel respected.'),
    styles: [tr('輕柔', 'Gentle'), tr('有耐心', 'Patient'), tr('用安撫的語言', 'Soothing language'), tr('避免讓緊張升溫', 'Keeps tension from rising')],
  },
  {
    id: 'hana',
    name: 'Hana',
    emoji: '🍃',
    tagline: tr('正念的陪伴者', 'The mindful companion'),
    description: tr('Hana 鼓勵你們先安在當下、保持好奇，理解之後再回應。', 'Hana encourages you to be present and curious first, and respond once you understand.'),
    styles: [tr('平靜', 'Calm'), tr('好奇', 'Curious'), tr('不批判', 'Non-judgmental'), tr('善用反思性提問', 'Uses reflective questions')],
  },
  {
    id: 'mei',
    name: 'Mei',
    emoji: '🌙',
    tagline: tr('溫暖的引路人', 'The warm guide'),
    description: tr('Mei 在善意與引導之間取得平衡：深深地聽，也溫柔地幫你們一起成長。', 'Mei balances kindness and guidance: she listens deeply and gently helps you grow together.'),
    styles: [tr('溫暖', 'Warm'), tr('鼓勵', 'Encouraging'), tr('給體貼的建議', 'Thoughtful suggestions'), tr('溫柔的督促', 'Gentle nudges')],
  },
  {
    id: 'luma',
    name: 'Luma',
    emoji: '✨',
    tagline: tr('沉穩的關係陪伴者', 'The steady relationship companion'),
    description: tr('Luma 不選邊站。她讓雙方都感到被聽見，幫困難的對話慢下來，在解決問題之前先幫你們理解彼此。', 'Luma doesn\'t take sides. She makes you both feel heard, slows hard conversations down, and helps you understand each other before solving the problem.'),
    styles: [tr('中立', 'Neutral'), tr('情緒智慧高', 'Emotionally wise'), tr('同時接住雙方', 'Holds you both'), tr('先理解再解決', 'Understand first, then solve')],
    recommended: true,
  },
];

export const DEFAULT_COMPANION_ID = 'luma';

export function getCompanion(id?: string | null): AiCompanion | null {
  if (!id) return null;
  return AI_COMPANIONS.find((c) => c.id === id) || null;
}

// Display name for a companion id; falls back to the generic label so
// pre-feature AI messages (no attribution) keep reading naturally.
export function companionName(id?: string | null): string | null {
  return getCompanion(id)?.name || null;
}

// The user's effective companion (their pick, or Luma until they choose).
export function resolveCompanion(id?: string | null): AiCompanion {
  return getCompanion(id) || (getCompanion(DEFAULT_COMPANION_ID) as AiCompanion);
}
