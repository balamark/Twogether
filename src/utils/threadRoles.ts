// Twogether 的對話視覺文法 —— 所有多方對話介面共用的單一來源。
//
//     位置辨識誰，Label 辨識角色，Component 辨識行為，顏色只做輔助。
//
// 之前每支元件各自寫三元式決定泡泡底色，結果同一個 AI 諮商師在牆上是奶油、在
// 好好說話裡是鼠尾草，而鼠尾草又剛好跟「對方」的泡泡同色 —— 五個說話者搶兩個色相。
// 解法不是再多發幾個顏色（那會把情緒產品變成 dashboard，也把語意色的空間吃光），
// 而是把「誰在說話」交給空間：
//
//   右   我
//   左   對方
//   中   中立第三方（Luma／真人心理師）—— 不站在任何一方，站在兩個人中間
//   全寬 系統訊息（衝突提醒、引導練習標記）—— 不屬於任何人，所以不是泡泡
//
// 顏色只剩兩種用途：Luma 拿唯一的品牌淡色（玫瑰），其餘留給語意
// （鼠尾草＝做到了、琥珀＝注意、橘／紅＝衝突升溫）。人不佔任何色相。
//
// 引導 (guide) 不是第四個角色，是 Luma 的第二種 mode —— 同一個品牌色、同一個頭像，
// 靠 🧭 icon、label 與獨立的練習介面區分，見 GuideSessionView.tsx。

export type ThreadSeat = 'left' | 'right' | 'center' | 'full';

export type ThreadRole = 'self' | 'partner' | 'counselor' | 'therapist' | 'system';

// Luma 的兩種談話模式。共用 ROLE_STYLE.counselor 的顏色與頭像，差別在 label 與版型。
export type CounselorMode = 'counselor' | 'guide';

export const SEAT: Record<ThreadRole, ThreadSeat> = {
  self: 'right',
  partner: 'left',
  counselor: 'center',
  therapist: 'center',
  system: 'full',
};

// Flex 對齊，讓每個座位的規則只寫一次。
export const SEAT_ALIGN: Record<ThreadSeat, string> = {
  left: 'justify-start',
  right: 'justify-end',
  center: 'justify-center',
  full: 'justify-center',
};

interface RoleStyle {
  // 泡泡表面：中性（人）或品牌淡色（Luma）。
  surface: string;
  // 角色名稱的文字色。
  label: string;
  // 泡泡最大寬度 —— 中間座位寬一點，因為第三方講的是整段觀察而不是一句話。
  width: string;
}

export const ROLE_STYLE: Record<ThreadRole, RoleStyle> = {
  // 兩個人都是中性的：誰在說話由左右 + 頭像 + 名字決定，不需要各佔一個色相。
  self: {
    surface: 'bg-petal-cream-2 border border-petal-rule-soft',
    label: 'text-petal-ink',
    width: 'max-w-[80%]',
  },
  partner: {
    surface: 'bg-white border border-petal-rule',
    label: 'text-petal-ink',
    width: 'max-w-[80%]',
  },
  // 全站唯一帶品牌色的說話者 —— 看到玫瑰淡底就知道是 Luma。
  counselor: {
    surface: 'bg-petal-rose-soft/25 border border-petal-rose-soft',
    label: 'text-petal-rose-deep',
    width: 'max-w-[92%] w-full',
  },
  // 真人心理師也是人，所以不吃色相；靠置中座位 + 🩺 頭像 + 名字分辨。用 cream-2 而
  // 不是白色，因為他也會出現在白底的容器上（牆上的貼文卡是 bg-white），白底配白泡泡
  // 等於沒有泡泡。
  therapist: {
    surface: 'bg-petal-cream-2 border border-petal-rule',
    label: 'text-petal-ink-soft',
    width: 'max-w-[92%] w-full',
  },
  // 系統訊息不畫泡泡，這裡只給需要底色的情況（例如引導標記的 hover 態）。
  system: {
    surface: 'bg-transparent',
    label: 'text-petal-muted',
    width: 'w-full',
  },
};

// 各介面的訊息型別長得不一樣（事件訊息 / 牆上回覆 / 公開問答），所以只收共通旗標。
export interface ThreadRoleInput {
  isAi?: boolean | null;
  isTherapist?: boolean | null;
  isOwn?: boolean | null;
}

export function threadRole({ isAi, isTherapist, isOwn }: ThreadRoleInput): ThreadRole {
  if (isAi) return 'counselor';
  if (isTherapist) return 'therapist';
  return isOwn ? 'self' : 'partner';
}

// 泡泡的完整 class。牆是討論串沒有左右軸，所以 seat 由呼叫端決定要不要用。
export function bubbleClass(role: ThreadRole): string {
  const s = ROLE_STYLE[role];
  return `${s.width} rounded-2xl px-4 py-3 ${s.surface}`;
}

// Luma 的顯示名稱。counselor / guide 是同一個人的兩種 mode，所以字尾不同、名字相同。
export function counselorLabel(name: string | null | undefined, mode: CounselorMode = 'counselor'): string {
  const suffix = mode === 'guide' ? '引導' : 'AI 諮商師';
  return name ? `${name}・${suffix}` : suffix;
}
