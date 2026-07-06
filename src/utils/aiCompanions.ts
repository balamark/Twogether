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
    tagline: '溫柔的傾聽者',
    description: 'Sophie 會先建立情緒上的安全感。她在給建議之前，一定先接住你的感受，鼓勵你們對彼此坦露脆弱。',
    styles: ['溫暖', '輕柔', '有同理心', '不急著給解法'],
  },
  {
    id: 'emma',
    name: 'Emma',
    emoji: '🌻',
    tagline: '鼓勵你的朋友',
    description: 'Emma 像一位真心希望你們幸福的好朋友，用日常的語言陪你們聊，為每一點進步喝采。',
    styles: ['正向', '安心', '有盼望', '用日常語言'],
  },
  {
    id: 'kai',
    name: 'Kai',
    emoji: '🧭',
    tagline: '務實的教練',
    description: 'Kai 專注於可行的下一步和健康的溝通習慣，給你們具體、清楚的建議。',
    styles: ['直接', '有條理', '以解法為導向', '給具體建議'],
  },
  {
    id: 'sage',
    name: 'Sage',
    emoji: '🌿',
    tagline: '睿智的引導者',
    description: 'Sage 幫你們看見更大的圖像，理解關係中一再出現的模式。',
    styles: ['沉穩', '深思', '有洞察', '培養自我覺察'],
  },
  {
    id: 'ember',
    name: 'Ember',
    emoji: '🔥',
    tagline: '關係的加油者',
    description: 'Ember 帶著溫暖與樂觀，在對話變得疏離時，幫你們重新靠近彼此。',
    styles: ['有活力', '鼓舞人心', '歌頌你們的愛', '促進重新連結'],
  },
  {
    id: 'aiko',
    name: 'Aiko',
    emoji: '🌸',
    tagline: '溫柔的和平使者',
    description: 'Aiko 幫衝突慢下來，創造讓雙方都感到被尊重的空間。',
    styles: ['輕柔', '有耐心', '用安撫的語言', '避免讓緊張升溫'],
  },
  {
    id: 'hana',
    name: 'Hana',
    emoji: '🍃',
    tagline: '正念的陪伴者',
    description: 'Hana 鼓勵你們先安在當下、保持好奇，理解之後再回應。',
    styles: ['平靜', '好奇', '不批判', '善用反思性提問'],
  },
  {
    id: 'mei',
    name: 'Mei',
    emoji: '🌙',
    tagline: '溫暖的引路人',
    description: 'Mei 在善意與引導之間取得平衡：深深地聽，也溫柔地幫你們一起成長。',
    styles: ['溫暖', '鼓勵', '給體貼的建議', '溫柔的督促'],
  },
  {
    id: 'luma',
    name: 'Luma',
    emoji: '✨',
    tagline: '沉穩的關係陪伴者',
    description: 'Luma 不選邊站。她讓雙方都感到被聽見，幫困難的對話慢下來，在解決問題之前先幫你們理解彼此。',
    styles: ['中立', '情緒智慧高', '同時接住雙方', '先理解再解決'],
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
