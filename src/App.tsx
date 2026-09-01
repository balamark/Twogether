import { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, MessageCircle, Clock, MapPin, Play, Coins, User, Trash2, Pencil, Crown, Home as HomeIcon, TrendingUp, HeartHandshake } from 'lucide-react';
import SettingsView from './components/SettingsView';
import HomeView from './components/HomeView';
import GrowView from './components/GrowView';
import TalkSwitcher from './components/TalkSwitcher';
import ActivityView from './components/ActivityView';
import UpgradeView, { BillingResultView } from './components/UpgradeView';
import PremiumExpiryBanner from './components/PremiumExpiryBanner';
import { BookingResultView } from './components/BookingResultView';
import RoleplayView from './components/RoleplayView';
import ScriptUploadModal, { type PendingScriptDraft } from './components/ScriptUploadModal';
import GamesView from './components/GamesView';
import CoinShopView from './components/CoinShopView';
import OurJourneyView from './components/OurJourneyView';
import AuthModal from './components/AuthModal';
import CalendarView from './components/CalendarView';
import ConflictView from './components/ConflictView';
import WallView from './components/WallView';
import EventsView from './components/EventsView';
import TherapistsView from './components/TherapistsView';
import LoggedOutPreview, { CommunicationPrinciples } from './components/LoggedOutPreview';
import Testimonials from './components/Testimonials';
import FeedbackView from './components/FeedbackView';
import LoveLanguageView from './components/LoveLanguageView';
import type { WallExample } from './components/WallPostComposer';
import Header from './components/Header';
import { NotificationContainer } from './components/ErrorNotification';
import ErrorBoundary from './components/ErrorBoundary';
import IntimacyRequestsHistory from './components/IntimacyRequestsHistory';
import IntimacyRequestForm from './components/IntimacyRequestForm';
import NotificationInbox from './components/NotificationInbox';
import MomentResponseBar from './components/MomentResponseBar';
import PairingInvitationHandler from './components/PairingInvitationHandler';
import { PairingInviteShare } from './components/PairingInviteShare';
import PairingReminderBanner from './components/PairingReminderBanner';
import DeepDiveJourneyView, { type DeepDiveIntent } from './components/deepdive/DeepDiveJourneyView';
import DeepDiveResumeBanner from './components/deepdive/DeepDiveResumeBanner';
import type { DeepDiveJourney, DeepDiveInboxItem } from './services/api';
import AiCompanionOnboarding from './components/AiCompanionPicker';
import HelpView from './components/HelpView';
import StoriesView from './components/StoriesView';
import { resolveCompanion } from './utils/aiCompanions';
import { apiService, getTokenExpiry, clearAuthStorage } from './services/api';
import type { CycleRecord, BillingStatus, PairingInvitationSummary, MomentResponse, MomentReactionKey } from './services/api';
import { buildPairingAcceptLink } from './utils/pairingLink';
import { pickPendingInvite } from './utils/pairingReminder';
import { getPrimaryTimezone, formatYmdInTz, browserTz } from './utils/datetime';
import { parseScript } from './utils/script';
import { clientLog } from './utils/telemetry';
import { useMediaProtection } from './hooks/useMediaProtection';
import { TimezoneProvider } from './contexts/TimezoneContext';
import { FeatureFlagsProvider } from './contexts/FeatureFlagsProvider';
import { EngineerModeProvider } from './contexts/EngineerModeProvider';
import EngineerTextEngine from './components/EngineerTextEngine';
import { useScrollLock } from './hooks/useScrollLock';
import { usePageTracking } from './hooks/usePageTracking';

// The accept link for a just-sent pairing invite, surfaced so the inviter can
// share it directly (LINE, copy/paste) rather than relying on the email
// arriving in the partner's inbox rather than their spam folder.
interface PairingInviteState {
  link: string;
  email: string;
  emailSent: boolean;
}

const buildPairingInviteState = (
  result: { invitation?: { token?: string; emailSent?: boolean } } | undefined,
  email: string
): PairingInviteState | null => {
  const token = result?.invitation?.token;
  if (!token) return null;
  return {
    link: buildPairingAcceptLink(token),
    email,
    emailSent: result?.invitation?.emailSent !== false,
  };
};

export interface IntimateRecord {
  id: number;
  apiId?: string;
  date: string;
  time: string;
  mood: string;
  notes?: string;
  timestamp: string;
  photo?: string;      // display URL
  photoId?: string;    // photos.id — links/clears the record's photo on save
  description?: string;
  duration?: string;
  location?: string;
  roleplayScript?: string;
  coinsEarned?: number;
  activityType?: string;
  recordedById?: string;
  recordedByNickname?: string;
  // 快速回應 — pre-digested by the backend into "mine" and "theirs".
  myResponse?: MomentResponse | null;
  partnerResponse?: MomentResponse | null;
}

interface Nicknames {
  partner1: string;
  partner2: string;
  // Genders let script parsing map [男]/[女] roles to the right partner.
  partner1Gender?: string;
  partner2Gender?: string;
}

export interface JourneyMilestone {
  id: string;
  type: 'meeting' | 'first_date' | 'first_kiss' | 'first_sex' | 'marriage' | 'child_born' | 'intimacy_milestone' | 'custom';
  date: string;
  title: string;
  description: string;
  place?: string;
  count?: number;
  recordId?: number;
  isCustom?: boolean;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  coins?: number;
  badge?: string;
  duration?: number;
}

interface CoinActivity {
  type: string;
  baseCoins: number;
  bonusConditions?: { condition: string; bonus: number }[];
}

export interface RoleplayScript {
  id: string;
  title: string;
  category: 'romantic' | 'adventurous' | 'school' | 'bold';
  scenario: string;
  /** Scenario location (場景地點), e.g. 教室、辦公室 — filterable. */
  location?: string | null;
  image?: string;
  script: string;
  isCustom?: boolean;
  isPublic?: boolean;
  createdBy?: string;
  createdAt?: string;
  tags?: string[];
  duration?: string;
  /** Full ordered photo series for the lightbox (cover first). */
  photos?: string[];
}

interface ApiCustomScript {
  id?: string;
  title?: string;
  category?: RoleplayScript['category'];
  scenario?: string;
  location?: string | null;
  script?: string;
  content?: string;
  tags?: string[];
  duration?: string;
  thumbnailUrl?: string;
  photos?: string[];
  isCustom?: boolean;
  isPublic?: boolean;
  createdBy?: string;
  createdAt?: string;
}

interface ApiCustomGift {
  id: string;
  title: string;
  description: string;
  cost: number;
  category: CoinGift['category'];
  icon: string;
  isCustom?: boolean;
  createdBy?: string;
}

export interface CoinGift {
  id: string;
  title: string;
  description: string;
  cost: number;
  category: 'service' | 'experience' | 'physical' | 'intimate';
  icon: string;
  isCustom?: boolean;
  createdBy?: string;
}

interface User {
  id: string;
  email: string;
  nickname: string;
  gender?: 'male' | 'female' | 'other';
  birth_date?: string | null;
  email_notifications_enabled?: boolean;
  cycle_tracking_enabled?: boolean;
  email_verified?: boolean;
  timezone?: string | null;
  couplePrimaryTimezone?: string | null;
  partnerTimezone?: string | null;
  partnerId?: string;
  partnerCode?: string;
  partnerNickname?: string;
  // Chosen AI 諮商師 companion id (e.g. 'luma'); null/undefined = not picked
  // yet, which triggers the one-time onboarding picker.
  selected_therapist?: string | null;
  // Public-share anonymity preference (署名 vs 匿名) — drives the story
  // compose flow's anonymity notice; the server snapshots the real value.
  public_share_show_nickname?: boolean;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  partnerConnected: boolean;
}

// Default roleplay scripts
const defaultRoleplayScripts = [
  {
    id: 'fan-idol-backstage',
    title: '粉絲與偶像：後台限定應援會',
    category: 'adventurous' as const,
    scenario: '演唱會結束後的後台更衣室，粉絲闖入的禁忌應援',
    image: 'images/roleplay/fan.png',
    script: `[partner2]（滿臉興奮）：「天啊！是真的你……我居然能進來！」\n[partner1]（輕笑，擦汗）：「你怎麼拿到 backstage pass 的？這裡不是一般人可以來的地方。」\n[partner2]（低頭輕聲）：「我排了一整晚的隊，還偷偷賄賂了工作人員……因為我想告訴你一件事。」\n[partner1]（挑眉）：「你想告白？我每天收幾百封信，什麼都看過。」\n[partner2]（靠近一步）：「可你沒看過，我願意為你做的事。哪怕只是幫你擦汗，幫你按摩腳。」（此時可幫對方擦臉，脫掉外套）\n[partner1]（嘴角上揚）：「你是來當助理的？還是……想當更特別的粉絲？」\n（進入試探與誘惑階段，可選「說出你的幻想」「模仿偶像舞步」等）\n\n後續互動建議：\n- 偶像提出「粉絲任務」：念出應援口號＋親吻手背\n- 以身應援：跪下綁鞋帶，唱出最愛歌詞並用身體表現\n- 播放演唱會音效創造臨場感`,
    duration: '20-30分鐘'
  },
  {
    id: 'wife-oldclassmate',
    title: '人妻與老同學：重逢的夜晚',
    category: 'romantic' as const,
    scenario: '咖啡廳續攤到飯店房間，氣氛曖昧的重逢',
    image: 'images/roleplay/coffee shop.png',
    script: `[partner1]（輕鬆）：「沒想到妳變這麼漂亮。當年還是那個綁馬尾的書呆子。」\n[partner2]（微笑）：「你變得更……自信了。我還記得你以前坐我後面，總是借筆。」\n[partner1]（湊近些）：「我記得的不是筆，是妳背後的香味。」\n[partner2]（低頭）：「別鬧了……我現在可是人妻。」\n[partner1]（低語）：「但我不是你的丈夫。我是那個你當年錯過的人。」（可加入對視與肢體觸碰）\n\n後續引導：\n- 回憶遊戲：輪流說出大學時代對彼此的回憶\n- 「如果當年我有勇氣⋯⋯」接龍句，引導壓抑情感\n- 最終選擇：「今晚，就當回大學生，好嗎？」`,
    duration: '25-35分鐘'
  },
  {
    id: 'photographer-model',
    title: '攝影師與模特兒：寫真誘惑',
    category: 'adventurous' as const,
    scenario: '柔光攝影棚裡的寫真指導與凝視',
    image: 'images/roleplay/model_cameramen.png',
    script: `[partner1]（專業）：「今天的主題是『慾望中的自己』，妳準備好了嗎？」\n[partner2]（緊張）：「這是我第一次拍這種風格……但我想試試看。」\n[partner1]（輕笑）：「放心，我會引導妳。先站到鏡子前，看著妳自己。」（慢慢脫去外衣，觀察肢體）\n[partner1]（低語）：「妳現在看到的，不是誰的老婆、誰的媽媽，只是妳自己——一個渴望被凝視的女人。」\n[partner2]（喘息）：「我從沒這樣看過我自己……好像，我突然開始喜歡這樣的我了。」\n\n後續互動建議：\n- 指導語：「轉身、抬頭、手放這裡……」\n- 「我看見了妳眼裡的慾望，現在妳也看看我。」\n- 最後拍下一張象徵性的照片（自拍或合影）作為紀念`,
    duration: '20-30分鐘'
  },
  {
    id: 'first-meeting',
    title: '初次相遇',
    category: 'romantic' as const,
    scenario: '在咖啡廳偶然相遇的陌生人',
    image: 'images/roleplay/coffee shop.png',
    script: `[partner1]: 不好意思，這個位子有人坐嗎？
[partner2]: 沒有，請坐。你看起來很面熟，我們是不是在哪裡見過？
[partner1]: 我也有這種感覺，也許是命運的安排。我叫[partner1]，你呢？
[partner2]: 我是[partner2]，很高興認識你。你常來這家咖啡廳嗎？
[partner1]: 第一次來，但看來我會常來的。因為遇到了特別的人。
[partner2]: 你真會說話。那要不要一起喝杯咖啡，聊聊彼此？`,
    duration: '15-20分鐘'
  },
  {
    id: 'office-romance',
    title: '辦公室秘密',
    category: 'adventurous' as const,
    scenario: '下班後的辦公室，只剩下你們兩個',
    image: 'images/roleplay/office.png',
    script: `[partner1]: 終於只剩我們兩個了，今天加班真累。
[partner2]: 是啊，不過和你一起加班感覺還不錯。
[partner1]: 我一直想找機會和你單獨聊聊...關於我們。
[partner2]: 我也是，其實我對你...有特別的感覺。
[partner1]: 真的嗎？我還以為只有我一個人這樣想。
[partner2]: 那現在我們該怎麼辦？這裡是辦公室...
[partner1]: 沒關係，現在沒有人會來。讓我好好看看你...`,
    duration: '20-30分鐘'
  },
  {
    id: 'forbidden-temptation',
    title: '禁忌誘惑',
    category: 'adventurous' as const,
    scenario: '朋友的聚會上，兩個不該在一起的人',
    image: 'images/roleplay/party.png',
    script: `[partner1]: 我們不應該在這裡...
[partner2]: 我知道，但我忍不住。每次看到你，我就...
[partner1]: 別人會看到的。我們是朋友的...
[partner2]: 忘記那些吧，就這一次。你也感受到了，對嗎？
[partner1]: 這很危險...但我無法抗拒你。
[partner2]: 那就不要抗拒。跟我來，我知道一個安靜的地方。`,
    duration: '25-35分鐘'
  },
  {
    id: 'reunion-love',
    title: '舊情復燃',
    category: 'romantic' as const,
    scenario: '多年後的同學會，重遇初戀',
    image: 'images/roleplay/reunion-love.png',
    script: `[partner1]: [partner2]？真的是你嗎？這麼多年了...
[partner2]: [partner1]！我沒想到會在這裡見到你。你一點都沒變。
[partner1]: 你還是那麼美。這些年過得怎麼樣？
[partner2]: 還好，但總覺得缺少了什麼。現在看到你，我想起了...
[partner1]: 想起了什麼？
[partner2]: 想起了我們在一起的那些美好時光。你還記得嗎？
[partner1]: 當然記得，那是我最珍貴的回憶。你知道嗎，我從來沒有忘記過你。`,
    duration: '20-30分鐘'
  },
  {
    id: 'vacation-romance',
    title: '度假誘惑',
    category: 'romantic' as const,
    scenario: '海邊度假村的浪漫邂逅',
    image: 'images/roleplay/vacation-romance.png',
    script: `[partner1]: 這個海灘真美，尤其是夕陽西下的時候。
[partner2]: 是啊，但最美的風景是你。
[partner1]: 你真會說話。這次度假真是來對了。
[partner2]: 能遇到你，是我最大的收穫。今晚月色很美...
[partner1]: 你想做什麼？
[partner2]: 想和你一起在月光下漫步，然後...
[partner1]: 然後呢？
[partner2]: 然後讓這個夜晚變得難忘。`,
    duration: '15-25分鐘'
  },
  {
    id: 'campus-discipline',
    title: '校園群體幻想：明星校花的秘密懲罰',
    category: 'school' as const,
    scenario: '學校地下社辦的臨時懲戒會議',
    image: 'images/roleplay/discipline.png',
    script: `（可多人參與或一對一扮演多角）
[partner2]（校花，冷哼）：「你有證據嗎？還是你只是想抓我來羞辱我？」
[partner1]（風紀會長，嚴肅）：「學生會長室今晚只處理一件事——妳在教官室的『不當行為』。」
（會長慢慢走近，從信封中拿出照片）
[partner1]：「這些，是昨天從監控截下來的。妳自己看看。」
[partner1]（冷聲）：「身為校花，妳應該成為榜樣。但妳……選擇成為慾望的教材。」

——第二階段：壓力審問——
[partner1]（拍桌）：「懲戒委員，開始審問她。先檢查她今天穿的是不是校服規定。」
（此時可安排：解開領口、量裙長、故意拖延動作）
配角A（由伴侶扮演）：「看來裙子長度也不合規定……不如我們量一量？」
[partner2]（顫聲）：「你們這樣是……濫用職權……我會告你們！」
[partner1]（笑）：「妳可以告我。但妳內心真的想逃嗎？還是……想被更多人看到妳的另一面？」

——第三階段：羞辱與釋放——
配角B：「我們應該幫她重修『服從訓練』。」
[partner2]（呼吸急促）：「你們想怎樣……要我做什麼？」
[partner1]（靠近耳邊低語）：「現在，把手放到背後，跪坐下來。妳要自願接受處罰，才能證明妳願意悔改。」`,
    duration: '20-30分鐘'
  },
  {
    id: 'bubble-tea-girl',
    title: '手搖飲辣妹店員的私房特調',
    category: 'bold' as const,
    scenario: '街角手搖飲店，快打烊的挑逗時刻',
    image: 'images/roleplay/bubble-tea-girl.png',
    script: `⏰ 第1分鐘：挑逗開場
[partner2]（挑眉，輕聲）：「欸～這麼晚才來，專門等我下班嗎？你這樣很像跟蹤狂耶。」
[partner1]（微笑）：「我只是想喝點特別的……聽說你這邊有‘不公開菜單’？」
[partner2]（撥頭髮）：「哎唷，誰跟你說的啦～不過……如果你表現得夠乖，我也許可以幫你搖一杯‘真正讓你發抖’的。」

⏰ 第2–3分鐘：引導互動
[partner2]（咬唇，慢慢靠近吧台）：「先選口味吧，今天有『奶香濃厚』，還有『微鹹帶黏』，要哪一種？」
[partner1]（壓低聲音）：「我想要妳推薦的——最濃、最滑、最好喝的。」
[partner2]（拿出搖杯輕搖）：「那你要加一點‘秘密配料’嗎？不過會讓你整杯喝完之後……想要再來一次哦。」
（可用空搖杯模擬「搖動」動作）
[partner2]（挑釁）：「你知道嗎？這種搖法，手臂會酸……除非有人幫我扶一下腰，我才搖得更穩。」

⏰ 第4–6分鐘：調情升級
[partner2]：「我通常加冰量都是“正常”，但如果你今晚比較熱……要不要多加點‘冰鎮刺激’？」
[partner1]：「如果這杯真的這麼特別……我要你看著我，一口一口喝完。」
[partner2]（笑）：「那你要先說出今天點這杯的原因，說出你的『渴望口感』是什麼。」

⏰ 第6–8分鐘：壓軸羞恥指令（擇一）
- 「把這杯飲料含在嘴裡，唸一句：我今晚只想被妳搖到最底。」
- 「拍一張你喝這杯‘特調’的照片傳給我，證明你是 VIP 客人。」
- 「用手搖的方式，模擬你最想我為你做的動作。現在，對著我表演一次。」`,
    duration: '15-25分鐘'
  },
  {
    id: 'private-tutor',
    title: '一對一私人導師：指導到最深處',
    category: 'bold' as const,
    scenario: '晚上九點的家教時間，嚴格導師與狡黠學生',
    image: 'images/roleplay/private-tutor.png',
    script: `⏰ 第 1–2 分鐘：冷調引入
[partner2]（嬌嗔）：「老師～為什麼今天又排我這麼晚？你是不是……比較喜歡我一對一的樣子？」
[partner1]（冷淡）：「你這個成績，全班倒數，還好意思跟我撒嬌？快把作業拿出來。」
[partner2]（小聲）：「作業……忘在房間了。不過我今天帶了別的東西想給你看看……」
[partner1]（挑眉）：「你知道我最討厭學生亂來。再這樣，我得對你進行行為訓誡。」
[partner2]（笑）：「我最喜歡被你‘訓誡’了呀，老師～每次都教得好用心喔～」

⏰ 第 3–5 分鐘：升溫挑逗互動
[partner1]（靠近桌前，低聲）：「那我今天改用‘體罰式教學’，看你記不記得清楚。」
（可拿起尺、筆或手敲桌，增加壓迫感）
[partner2]（咬唇）：「老師，你可以邊打邊講課嗎？這樣我會記更牢……特別是‘身體記憶’。」
[partner1]（命令）：「趴下，把手放在桌子邊緣。我唸一道題，你錯一個字，就自己承認一次錯誤。」
[partner2]（顫聲）：「是……老師。」

⏰ 第 6–8 分鐘：羞恥補課遊戲
建議「羞恥題目」引導：
- 「請問我哪一科最差？」→「性愛學。你每次都逃課，現在我會補上每一堂。」
- 「老師怎麼處罰不乖的學生？」→「我會讓妳身體整晚記住什麼叫紀律。」
[partner2]（唸問題卡）：「為什麼老師總是對我特別兇？」
[partner1]：「因為我怕自己會對你太溫柔……你這種學生，不能寵。」

🎮 延伸玩法（互動指令）
- 📝 把你的「悔過書」寫在老師身上（用指頭）。
- 📚 脫掉校服後，跪著朗讀今天錯的題目三次。
- 📷 拍下你懺悔的樣子，傳給老師做「學習記錄」。`,
    duration: '20-30分鐘'
  }
];

// Wall mood tag whitelist — must match WALL_MOOD_TAGS in routes/wall.js
const WALL_MOOD_TAGS = [
  '想念你', '需要空間', '想被抱抱', '想溝通',
  '感謝', '撒嬌', '開心', '難過', '有想法',
] as const;

// Built-in starter examples shown in the composer's "從範本開始" section and
// as demo cards when the wall is empty.
//
// Order matters: the short, one-glance templates come first (the empty-state
// demo cards show the first few, and a wall of text scares people off), with
// the long meta-communication framework last for whoever wants it.
const defaultWallExamples: WallExample[] = [
  {
    id: 'example-thanks-today',
    title: '謝謝你今天…',
    category: 'general',
    mood_tag: '感謝',
    content: `謝謝你今天＿＿＿（一件很小的事）。

那個當下我覺得＿＿＿，想讓你知道我有看見。`,
  },
  {
    id: 'example-need-space',
    title: '我需要一點空間，不是不愛你',
    category: 'general',
    mood_tag: '需要空間',
    content: `我現在有點滿，需要自己安靜一下。

這跟你沒有關係，也不是生你的氣。＿＿＿（大概多久）之後我會來找你。`,
  },
  {
    id: 'example-want-hug',
    title: '今天想被抱抱',
    category: 'general',
    mood_tag: '想被抱抱',
    content: `今天有點累，不用問我發生什麼事，抱我一下就好。

如果可以，＿＿＿（例如：晚上一起躺著看個影片）。`,
  },
  {
    id: 'example-missing-you',
    title: '想念你的一個瞬間',
    category: 'general',
    mood_tag: '想念你',
    content: `今天＿＿＿（在哪裡／做什麼）的時候突然想到你。

想到的是＿＿＿。`,
  },
  {
    id: 'example-small-request',
    title: '有一件小事，想拜託你',
    category: 'important',
    mood_tag: '想溝通',
    content: `我想拜託你的是：＿＿＿（具體、做得到的一件事）。

因為這樣我會覺得＿＿＿。不急著現在回答，你想一下再跟我說。`,
  },
  {
    id: 'example-affirm-alternative',
    title: '當我累了又被靠近時，我希望你這樣回應我',
    category: 'important',
    mood_tag: '想溝通',
    content: `（1）先肯定我
「我知道你想靠近我，這樣讓我覺得很甜。」

（2）再給一個解決方式（不一定要做愛）
・「我現在沒有力氣做愛，但我可以抱你一下。」
・「我現在不行，可是我可以摸摸你的手。」
・「我們可以聊天黏一下，不要嘿咻好嗎？」

（3）如果真的沒有力氣，給一個「確切時間」
・「我現在真的累爆，晚上九點我來抱你。」
・「你先讓我休息一下，我 20 分鐘後來找你。」

（4）最後加一點撒嬌／貼心動作，讓我覺得被愛
不需要花大力氣，只要一點點：
・輕輕捏一下我的手
・抱一下
・撫摸一下後頸
・用可愛的語氣說一句「你這樣亂勾引，我會想你啦～」
・眼神看我一下笑一下

我要你明白：
我不是要「嘿咻」，我要的是「我被愛、我被放在心上、我不是孤單」。`,
  },
];

// Add interfaces for the data structures
export interface ForeplayActivity {
  title: string;
  description: string;
  duration: string;
  coins: number;
  tips: string[];
}

export interface PositionSuggestion {
  name: string;
  difficulty: string;
  description: string;
  coins: number;
  benefits: string[];
}

// Active-tab persistence: restore the same view on refresh. Whitelisted so a
// stale/unknown stored value can't drop the user on an unexpected page.
const VIEW_STORAGE_KEY = 'tw:lastView';
const PERSISTED_VIEWS = new Set([
  'home', 'talk', 'us', 'grow',
  'record', 'achievements', 'conflict', 'events', 'roleplay', 'wall',
  'therapists', 'counselor', 'stories', 'shop', 'journey', 'intimacy-history', 'settings', 'activity',
  'feedback', 'love-language', 'upgrade', 'pricing', 'foreplay', 'games', 'communicate', 'help',
]);

const LoveTimeApp = () => {
  // Persist the active tab across page refreshes so a reload keeps the user on
  // the same page (e.g. 角色扮演) instead of bouncing back to 記錄時光. Only
  // restore known navigable views; transient/result flows handle their own view.
  const [currentView, setCurrentView] = useState(() => {
    if (typeof window === 'undefined') return 'home';
    const p = window.location.pathname;
    if (p.startsWith('/billing/result') || p.startsWith('/booking/result')) return 'home';
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved && PERSISTED_VIEWS.has(saved)) return saved;
    } catch { /* storage disabled — fall back to default */ }
    return 'home';
  });

  // Remember the active tab (best-effort) so a refresh restores it.
  useEffect(() => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, currentView); } catch { /* ignore */ }
  }, [currentView]);
  // Message shown atop the Upgrade view when the user is sent there by hitting a
  // usage cap (set from the global `billing:limit-reached` event).
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null);
  // True when ECPay redirected the browser back to /billing/result.
  const [isBillingResult, setIsBillingResult] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname.startsWith('/billing/result')
  );
  // True when ECPay redirected the browser back to /booking/result (video session).
  const [isBookingResult, setIsBookingResult] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname.startsWith('/booking/result')
  );
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  // Set when another view means "write one now" (接住情緒's CTA) so 說開一件事
  // opens on the composer instead of the history list. Consumed once.
  const [pendingEventsCompose, setPendingEventsCompose] = useState(false);
  // Set by 今天's "加一筆記錄" CTA so 我們 opens the add-record modal once it
  // mounts (the modal only exists inside CalendarView). Consumed once.
  const [pendingAddRecord, setPendingAddRecord] = useState(false);
  const [pendingScriptTitle, setPendingScriptTitle] = useState<string | null>(null);
  const [intimateRecords, setIntimateRecords] = useState<IntimateRecord[]>([]);
  const [cycleRecords, setCycleRecords] = useState<CycleRecord[]>([]);
  const [nicknames, setNicknames] = useState<Nicknames>({ partner1: '親愛的', partner2: '寶貝' });

  // Custom game content — user-added items that get merged into the default lists
  // of 回憶倒帶 (questions) and 情緒模仿秀 (emotions) inside 情趣遊戲. Persisted
  // to localStorage for now; can be promoted to a couple-shared API endpoint later.
  const [customMemoryQuestions, setCustomMemoryQuestions] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('customMemoryQuestions');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [customEmotions, setCustomEmotions] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('customEmotions');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('customMemoryQuestions', JSON.stringify(customMemoryQuestions));
    } catch (e) {
      console.warn('Failed to persist customMemoryQuestions:', e);
    }
  }, [customMemoryQuestions]);

  useEffect(() => {
    try {
      localStorage.setItem('customEmotions', JSON.stringify(customEmotions));
    } catch (e) {
      console.warn('Failed to persist customEmotions:', e);
    }
  }, [customEmotions]);

  const [selectedDate, setSelectedDate] = useState(() => formatYmdInTz(new Date(), browserTz()));
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [roleplayFilter, setRoleplayFilter] = useState('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Notification system. Declared up here so the effects below can depend on it.
  //
  // Stable identity matters: consumers put this in useCallback/useEffect deps
  // (e.g. WallView.loadPosts), so a new function each render made showing any
  // toast refetch the wall and remount open threads — which threw away their
  // loaded 情緒翻譯. Only setNotifications is used, and that is already stable.
  const showNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    const newNotification = { ...notification, id };
    setNotifications(prev => [...prev, newNotification]);

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, notification.duration || 5000);
  }, []);

  // 情緒深潛 Emotional Deep Dive: opening the full-screen journey layer, plus the
  // resume banner (the user's core ask: pause now, finish later). intent !== null
  // means the layer is open; activeDeepDive drives the dismissible resume banner.
  const [deepDiveIntent, setDeepDiveIntent] = useState<DeepDiveIntent | null>(null);
  const [activeDeepDive, setActiveDeepDive] = useState<DeepDiveJourney | null>(null);
  const [incomingDeepDive, setIncomingDeepDive] = useState<DeepDiveInboxItem | null>(null);
  const [deepDiveBannerDismissed, setDeepDiveBannerDismissed] = useState(false);

  const [totalCoins, setTotalCoins] = useState(0);
  const [customGifts, setCustomGifts] = useState<CoinGift[]>([]);
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    partnerConnected: false
  });
  const { isAuthenticated, user: authUser, partnerConnected } = authState;

  // Fetch the caller's resumable deep-dive journey (owner) and any journey a
  // partner shared with them (inbox), so both halves are reachable in-app.
  // Silent on failure — a missing banner is never worth a toast.
  const refreshActiveDeepDive = useCallback(async () => {
    if (!authState.isAuthenticated) { setActiveDeepDive(null); setIncomingDeepDive(null); return; }
    try {
      const own = await apiService.getActiveDeepDive();
      setActiveDeepDive(own);
      if (!own) {
        const inbox = await apiService.getDeepDiveInbox();
        setIncomingDeepDive(inbox[0] || null);
      } else {
        setIncomingDeepDive(null);
      }
    } catch {
      setActiveDeepDive(null);
      setIncomingDeepDive(null);
    }
  }, [authState.isAuthenticated]);
  useEffect(() => { refreshActiveDeepDive(); }, [refreshActiveDeepDive]);

  // Contextual entry: the conversation (EventDetail) opens 情緒深潛 by dispatching
  // a window event, so the deep-dive layer stays owned by App without prop drills.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const eventId = (e as CustomEvent<{ eventId?: string }>).detail?.eventId;
      setDeepDiveIntent({ type: 'start', eventId });
    };
    window.addEventListener('deepdive:open', onOpen);
    return () => window.removeEventListener('deepdive:open', onOpen);
  }, []);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPairingPrompt, setShowPairingPrompt] = useState(false);
  const [pairingPromptDismissed, setPairingPromptDismissed] = useState(
    localStorage.getItem('pairingPromptDismissed') === 'true'
  );
  // 「認識你的 AI 諮商師」onboarding step — shown once right after sign-up.
  // Existing users pick / change theirs in 設定 instead (no blocking modal on
  // login). Skipping keeps the Luma default without saving anything.
  const [showCompanionOnboarding, setShowCompanionOnboarding] = useState(false);
  const needsCompanionPick =
    showCompanionOnboarding &&
    authState.isAuthenticated &&
    !!authState.user &&
    authState.user.selected_therapist == null;
  const [pairingPromptEmail, setPairingPromptEmail] = useState('');
  const [pairingPromptSending, setPairingPromptSending] = useState(false);
  const [pairingPromptSent, setPairingPromptSent] = useState(false);
  // The accept link for the invite just sent, so the new user can pass it
  // along over LINE instead of waiting on an email that may be filtered.
  const [pairingPromptInvite, setPairingPromptInvite] = useState<PairingInviteState | null>(null);
  // Newest still-pending invite this user sent, for the reminder banner. null
  // means nothing pending (never invited, or every invite expired/answered).
  const [pendingPairingInvite, setPendingPairingInvite] = useState<PairingInvitationSummary | null>(null);

  // Funnel top-of-funnel beacon. Fires once per browser tab session when an
  // unauthenticated visitor reaches the app, so the /admin dashboard can count
  // distinct landing IPs vs signups. Skipped for already-authenticated users
  // so reloads don't inflate the visit count.
  useEffect(() => {
    if (authState.isAuthenticated) return;
    try {
      if (sessionStorage.getItem('tw_landing_beaconed') === '1') return;
      sessionStorage.setItem('tw_landing_beaconed', '1');
    } catch {
      // sessionStorage can throw in private modes — fall through and fire anyway.
    }
    fetch('/api/track/landing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ua: navigator.userAgent }),
      keepalive: true,
    }).catch(() => {});
  }, [authState.isAuthenticated]);

  const [customScripts, setCustomScripts] = useState<RoleplayScript[]>([]);
  const [favoriteScriptIds, setFavoriteScriptIds] = useState<Set<string>>(new Set());
  const [showScriptUploadModal, setShowScriptUploadModal] = useState(false);
  // When set, the upload modal opens in edit mode pre-filled from this script.
  const [editingScript, setEditingScript] = useState<RoleplayScript | null>(null);
  // When the free-tier script cap blocks an upload we stash the in-progress
  // draft here and send the user to Upgrade. After they go premium (coupon or
  // purchase) the upload modal re-opens pre-filled so no work is lost.
  const [pendingScriptDraft, setPendingScriptDraft] = useState<PendingScriptDraft | null>(null);
  const [showIntimacyRequestForm, setShowIntimacyRequestForm] = useState(false);
  const [showNotificationInbox, setShowNotificationInbox] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  // Couple's Premium status (tier + expiry). Fetched once on auth so the header
  // and the proactive expiry banner can render without each re-fetching.
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);

  // 諮商師角色切換 — a therapist account can flip the whole app between its couple
  // context and the 諮商師工作台. isTherapist is the only real signal (a therapist
  // profile exists); counselorMode is the user's device-local preference. The
  // switch (Header) only shows for therapists, and counselor tools only appear
  // while counselorActive — so a regular user's pages never carry them.
  const [isTherapist, setIsTherapist] = useState(false);
  const [counselorMode, setCounselorMode] = useState<boolean>(() => {
    try { return localStorage.getItem('counselorMode') === 'true'; } catch { return false; }
  });
  const counselorActive = counselorMode && isTherapist;
  // Deep-link token for the 諮商工作台 client panel: bumped when a notification
  // (dedicated_client_added) asks to jump straight to 我輔導的伴侶 and auto-open
  // the couple that just added this counselor. 0 = no pending focus.
  const [counselorClientsFocus, setCounselorClientsFocus] = useState(0);
  // The specific couple to auto-open in 我輔導的伴侶 (from the notification's
  // coupleId). null → open the most-recent client as a fallback (older
  // notifications predate the couple_id column).
  const [counselorClientsTargetCoupleId, setCounselorClientsTargetCoupleId] = useState<string | null>(null);

  // Page-view analytics for the /admin Pages + Retention tabs. Only fires for
  // authenticated users — anon traffic is already covered by landing_visits.
  // Each useEffect below reports an "enter" by calling track(); the hook
  // converts that into an "exit" insert on the next call or on tab close.
  const trackView = usePageTracking(authState.isAuthenticated);

  useEffect(() => {
    if (!authState.isAuthenticated) return;
    trackView(currentView, 'view');
  }, [currentView, authState.isAuthenticated, trackView]);

  useEffect(() => {
    if (showRecordModal) trackView('modal:record', 'modal');
    else trackView(currentView, 'view');
  }, [showRecordModal, currentView, trackView]);

  useEffect(() => {
    if (showAuthModal) trackView('modal:auth', 'modal');
    else if (authState.isAuthenticated) trackView(currentView, 'view');
  }, [showAuthModal, authState.isAuthenticated, currentView, trackView]);

  useEffect(() => {
    if (showScriptUploadModal) trackView('modal:script-upload', 'modal');
    else trackView(currentView, 'view');
  }, [showScriptUploadModal, currentView, trackView]);

  useEffect(() => {
    if (showIntimacyRequestForm) trackView('modal:intimacy-request', 'modal');
    else trackView(currentView, 'view');
  }, [showIntimacyRequestForm, currentView, trackView]);

  useEffect(() => {
    if (showNotificationInbox) trackView('modal:notification-inbox', 'modal');
    else trackView(currentView, 'view');
  }, [showNotificationInbox, currentView, trackView]);

  // Pairing invitation states
  const [pairingInvitationToken, setPairingInvitationToken] = useState<string | null>(null);
  const [showPairingInvitation, setShowPairingInvitation] = useState(false);
  // Check for pairing invitation token in URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      setPairingInvitationToken(token);
      setShowPairingInvitation(true);
      sessionStorage.setItem('pairingInviteToken', token);

      // Clean up URL to remove token after processing
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  // ?script=<title> deep link (from invitation emails): stash it, then open
  // the script in the roleplay view once the user is authenticated.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const scriptParam = urlParams.get('script');
    if (scriptParam) {
      sessionStorage.setItem('pendingScriptDeepLink', scriptParam);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);
  useEffect(() => {
    if (!authState.isAuthenticated) return;
    const stored = sessionStorage.getItem('pendingScriptDeepLink');
    if (stored) {
      sessionStorage.removeItem('pendingScriptDeepLink');
      setPendingScriptTitle(stored);
      setCurrentView('roleplay');
    }
  }, [authState.isAuthenticated]);

  // Load Premium status on auth (and clear it on logout) so the header badge and
  // the proactive expiry banner have the couple's tier + expiry. Best-effort:
  // a failed lookup just hides the badge/banner.
  useEffect(() => {
    if (!authState.isAuthenticated) {
      setBillingStatus(null);
      return;
    }
    let cancelled = false;
    apiService
      .getBillingStatus()
      .then((s) => { if (!cancelled) setBillingStatus(s); })
      .catch(() => { if (!cancelled) setBillingStatus(null); });
    return () => { cancelled = true; };
  }, [authState.isAuthenticated]);

  // Am I a therapist? The only signal is a therapist profile existing (getMy…
  // returns null on 404). Fetched on auth to drive the header role switch; a
  // failed/absent lookup just means "not a therapist" (no switch, no counselor
  // mode). Cleared on logout.
  useEffect(() => {
    if (!authState.isAuthenticated) {
      setIsTherapist(false);
      return;
    }
    let cancelled = false;
    apiService
      .getMyTherapistProfile()
      .then((p) => { if (!cancelled) setIsTherapist(!!p); })
      .catch(() => { if (!cancelled) setIsTherapist(false); });
    return () => { cancelled = true; };
  }, [authState.isAuthenticated]);

  // Persist the counselor-mode preference so a refresh keeps a therapist on the
  // same side of the switch (best-effort; private mode just forgets it).
  useEffect(() => {
    try { localStorage.setItem('counselorMode', counselorMode ? 'true' : 'false'); } catch { /* ignore */ }
  }, [counselorMode]);

  // Guard the counselor view: if we're on it but counselor mode isn't active
  // (a non-therapist restored a stale 'counselor' view, or the therapist probe
  // resolved false / they switched back), bounce to home.
  useEffect(() => {
    if (currentView === 'counselor' && !counselorActive) setCurrentView('home');
  }, [currentView, counselorActive]);

  useEffect(() => {
    if (!pairingInvitationToken) {
      const storedToken = sessionStorage.getItem('pairingInviteToken');
      if (storedToken) {
        setPairingInvitationToken(storedToken);
        setShowPairingInvitation(true);
      }
    }
  }, [pairingInvitationToken]);
  const [journeyMilestones, setJourneyMilestones] = useState<JourneyMilestone[]>([
    {
      id: 'meeting',
      type: 'meeting',
      date: '2024-01-01',
      title: '我們相遇的日子',
      description: '命運讓我們相遇，開始了這段美好的愛情故事'
    },
    {
      id: 'first_date',
      type: 'first_date',
      date: '',
      title: '開始交往',
      description: '緊張又興奮的第一次約會，從此心中只有彼此'
    },
    {
      id: 'first_kiss',
      type: 'first_kiss',
      date: '2024-01-20',
      title: '初吻',
      description: '那個讓時間停止的美好瞬間',
      place: ''
    },
    {
      id: 'first_sex',
      type: 'first_sex',
      date: '',
      title: '第一次親密場所',
      description: '愛情昇華的神聖時刻',
      place: ''
    }
  ]);

  const [selectedRecord, setSelectedRecord] = useState<IntimateRecord | null>(null);
  const [showRecordDetail, setShowRecordDetail] = useState(false);
  const [editingRecord, setEditingRecord] = useState<IntimateRecord | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<IntimateRecord | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [dayPickerDate, setDayPickerDate] = useState<string | null>(null);
  const [dayPickerRecords, setDayPickerRecords] = useState<IntimateRecord[]>([]);

  useScrollLock(showRecordModal);
  useScrollLock(showPairingPrompt);
  useScrollLock(showRecordDetail && !!selectedRecord);
  useScrollLock(showDeleteConfirm && !!deletingRecord);
  useScrollLock(!!dayPickerDate);

  const [showTagline, setShowTagline] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShowTagline(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  // Authentication functions
  const generatePartnerCode = () => {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  };

  const handleLogin = async (email: string, password: string) => {
    try {
      const authResult = await apiService.login(email, password);

      const userData = authResult.user as {
        id?: string;
        email: string;
        nickname: string;
        gender?: 'male' | 'female' | 'other';
        birth_date?: string | null;
        timezone?: string | null;
        email_notifications_enabled?: boolean;
        cycle_tracking_enabled?: boolean;
        email_verified?: boolean;
        selected_therapist?: string | null;
        public_share_show_nickname?: boolean;
        created_at?: string;
      };

      const user: User = {
        id: userData.id || Date.now().toString(),
        email: userData.email,
        nickname: userData.nickname,
        gender: userData.gender,
        birth_date: userData.birth_date,
        timezone: userData.timezone,
        email_notifications_enabled: userData.email_notifications_enabled,
        cycle_tracking_enabled: userData.cycle_tracking_enabled,
        email_verified: userData.email_verified,
        selected_therapist: userData.selected_therapist ?? null,
        public_share_show_nickname: userData.public_share_show_nickname,
        partnerCode: generatePartnerCode(),
        createdAt: userData.created_at || new Date().toISOString()
      };
      
      setAuthState({
        user,
        isAuthenticated: true,
        partnerConnected: false
      });
      
      setNicknames(prev => ({ ...prev, partner1: userData.nickname }));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: false }));
      setShowAuthModal(false);
      
      showNotification({
        type: 'success',
        title: '登入成功！',
        message: `歡迎回來 ${userData.nickname}！`,
        duration: 5000
      });
    } catch (error: unknown) {
      console.error('Login error:', error);
      showNotification({
        type: 'error',
        title: '登入失敗',
        message: (error as Error)?.message || '登入過程中發生錯誤，請檢查帳號密碼',
        duration: 8000
      });
    }
  };

  const handleRegister = async (email: string, nickname: string, password: string) => {
    try {
      const authResult = await apiService.register(email, nickname, password);
      
      const userData = authResult.user as {
        id?: string;
        email: string;
        nickname: string;
        email_verified?: boolean;
        created_at?: string;
      };

      const user: User = {
        id: userData.id || Date.now().toString(),
        email: userData.email,
        nickname: userData.nickname,
        email_verified: userData.email_verified ?? false,
        partnerCode: generatePartnerCode(),
        createdAt: userData.created_at || new Date().toISOString()
      };
      
      setAuthState({
        user,
        isAuthenticated: true,
        partnerConnected: false
      });
      
      setNicknames(prev => ({ ...prev, partner1: nickname }));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: false }));
      setShowAuthModal(false);
      // Onboarding step: meet your AI 諮商師 (companion) right after sign-up.
      setShowCompanionOnboarding(true);

      showNotification({
        type: 'success',
        title: '註冊成功！',
        message: `歡迎 ${nickname}！已為你創建新帳號`,
        duration: 5000
      });
    } catch (error: unknown) {
      console.error('Registration error:', error);
      showNotification({
        type: 'error',
        title: '註冊失敗',
        message: (error as Error)?.message || '註冊過程中發生錯誤，請檢查輸入資料',
        duration: 8000
      });
    }
  };

  useEffect(() => {
    // The AI companion picker takes precedence right after sign-up — don't
    // stack the pairing prompt on top of it. Also skip it in counselor mode:
    // "invite your partner" is a couple nudge that doesn't belong on the
    // 諮商師工作台.
    if (authState.isAuthenticated && !authState.partnerConnected && !pairingPromptDismissed && !needsCompanionPick && !counselorActive) {
      setShowPairingPrompt(true);
    } else {
      setShowPairingPrompt(false);
    }
  }, [authState.isAuthenticated, authState.partnerConnected, pairingPromptDismissed, needsCompanionPick, counselorActive]);

  // Pending-invite lookup for the reminder banner. Only runs while unpaired —
  // once paired the banner is gone and the answer stops mattering. A failure
  // just leaves the banner in its "還沒邀請" state; it must never block the UI.
  const refreshPendingPairingInvite = useCallback(async () => {
    if (!authState.isAuthenticated || authState.partnerConnected) {
      setPendingPairingInvite(null);
      return;
    }
    try {
      const invitations = await apiService.getMyPairingInvitations();
      setPendingPairingInvite(pickPendingInvite(invitations));
    } catch {
      setPendingPairingInvite(null);
    }
  }, [authState.isAuthenticated, authState.partnerConnected]);

  useEffect(() => {
    refreshPendingPairingInvite();
  }, [refreshPendingPairingInvite]);

  const handleResendPairingInvite = useCallback(
    async (token: string) => {
      try {
        await apiService.resendPairingInvitation(token);
        showNotification({
          type: 'success',
          title: '邀請已重新寄出',
          message: '請提醒另一半看一下信箱，也記得看垃圾郵件與促銷分頁。',
          duration: 6000,
        });
      } catch (err) {
        const e = err as Error & { error_code?: string };
        // Each failure mode gets its own next step (CLAUDE.md): a mail outage
        // is a warning with a workaround, a dead invite needs a fresh one.
        if (e?.error_code === 'EMAIL_NOT_CONFIGURED') {
          showNotification({
            type: 'warning',
            title: '目前無法寄信',
            message: '寄信服務暫時不可用。請按「傳連結給 TA」複製連結，直接傳給另一半。',
            duration: 8000,
          });
        } else if (e?.error_code === 'INVITATION_NOT_FOUND') {
          setPendingPairingInvite(null);
          showNotification({
            type: 'warning',
            title: '這個邀請已失效',
            message: '邀請已被接受、取消或過期。請重新邀請另一半。',
            duration: 8000,
          });
        } else {
          showNotification({
            type: 'error',
            title: '重新寄送失敗',
            message: e?.message || '請稍後再試，或按「傳連結給 TA」直接把連結傳過去。',
            duration: 6000,
          });
        }
      }
    },
    [showNotification]
  );

  const handlePartnerConnect = async (partnerCode: string) => {
    try {
      const result = await apiService.acceptPairingCode(partnerCode.trim());

      if (result.requiresAuth) {
        showNotification({
          type: 'info',
          title: '需要登入',
          message: '請先登入以接受配對邀請',
          duration: 6000
        });
        return;
      }

      showNotification({
        type: 'success',
        title: '配對成功！',
        message: result.autoResolved
          ? '配對成功，我們已自動處理重複邀請'
          : '您已成功與伴侶配對',
        duration: 8000
      });

      setShowAuthModal(false);
      window.location.reload();
    } catch (error: unknown) {
      const errorCode = (error as { error_code?: string })?.error_code;

      if (errorCode === 'INVITATION_NOT_FOUND') {
        showNotification({
          type: 'error',
          title: '配對碼無效',
          message: '配對碼無效或已過期，請確認後再試',
          duration: 8000
        });
        return;
      }

      showNotification({
        type: 'error',
        title: '配對失敗',
        message: (error as Error)?.message || '配對失敗，請稍後再試',
        duration: 8000
      });
    }
  };

  // Flip the counselor role switch. Entering counselor mode lands on the
  // workstation; leaving returns to 今天 (the couple home) so neither context
  // shows the other's screens.
  const handleToggleCounselorMode = () => {
    setCounselorMode((prev) => {
      const next = !prev;
      setCurrentView(next ? 'counselor' : 'home');
      return next;
    });
  };

  const handleLogout = async () => {
    // Logout must always clear local state, even if the server call hiccups —
    // otherwise the user stays on an authenticated panel with a cleared token.
    try {
      await apiService.logout();
    } catch (error: unknown) {
      console.error('Logout request failed (clearing locally anyway):', error);
    }
    setAuthState({
      user: null,
      isAuthenticated: false,
      partnerConnected: false
    });
    // Reset the view so we land back on the logged-out home, not whatever
    // authenticated panel (設定 / 金幣商店 / …) was open at logout time.
    setCurrentView('home');
    // Drop the counselor role too so the next login (possibly a different
    // account) never flashes a stale switch or workstation.
    setIsTherapist(false);
    setCounselorMode(false);
    showNotification({
      type: 'info',
      title: '已登出',
      message: '感謝使用 Twogether'
    });
  };

  // Pairing invitation handlers
  const handlePairingInvitationAccepted = () => {
    setShowPairingInvitation(false);
    setPairingInvitationToken(null);
    sessionStorage.removeItem('pairingInviteToken');

    // Refresh auth state to get updated couple information
    if (authState.isAuthenticated) {
      // Trigger a reload of user data to get the new couple relationship
      window.location.reload();
    }
  };

  const handlePairingInvitationRejected = () => {
    setShowPairingInvitation(false);
    setPairingInvitationToken(null);
    sessionStorage.removeItem('pairingInviteToken');
  };

  const handlePairingInvitationClosed = () => {
    setShowPairingInvitation(false);
    setPairingInvitationToken(null);
    sessionStorage.removeItem('pairingInviteToken');
  };

  // Coin activities configuration
  const coinActivities: { [key: string]: CoinActivity } = {
    'roleplay': { 
      type: '角色扮演', 
      baseCoins: 500,
      bonusConditions: [
        { condition: '使用新劇本', bonus: 200 },
        { condition: '超過30分鐘', bonus: 300 }
      ]
    },
    'new_position': { 
      type: '嘗試新姿勢', 
      baseCoins: 200,
      bonusConditions: [
        { condition: '第一次嘗試', bonus: 300 }
      ]
    },
    'long_session': { 
      type: '長時間親密', 
      baseCoins: 1000,
      bonusConditions: [
        { condition: '超過1小時', bonus: 500 }
      ]
    },
    'new_location': { 
      type: '新地點', 
      baseCoins: 300,
      bonusConditions: [
        { condition: '戶外', bonus: 400 }
      ]
    },
    'foreplay': { 
      type: '前戲活動', 
      baseCoins: 150 
    },
    'regular': { 
      type: '親密時光', 
      baseCoins: 100 
    }
  };

  // Default gift catalog
  const defaultGifts: CoinGift[] = [
    {
      id: 'massage',
      title: '全身按摩',
      description: '30分鐘專業按摩服務',
      cost: 1500,
      category: 'service',
      icon: '💆‍♀️'
    },
    {
      id: 'dinner',
      title: '浪漫晚餐',
      description: '親手準備一頓豐盛晚餐',
      cost: 2000,
      category: 'service',
      icon: '🍽️'
    },
    {
      id: 'movie_night',
      title: '電影之夜',
      description: '一起看最愛的電影加零食',
      cost: 800,
      category: 'experience',
      icon: '🎬'
    },
    {
      id: 'oral_service',
      title: '特殊服務',
      description: '你懂的特別服務',
      cost: 3000,
      category: 'intimate',
      icon: '💋'
    },
    {
      id: 'babysitting',
      title: '帶娃2小時',
      description: '讓伴侶休息2小時',
      cost: 2500,
      category: 'service',
      icon: '👶'
    },
    {
      id: 'shopping',
      title: '購物基金',
      description: '500元購物預算',
      cost: 5000,
      category: 'physical',
      icon: '💰'
    }
  ];

  // Load saved data on component mount - only once
  useEffect(() => {
    const loadInitialData = () => {
      // authState/authToken/authUser are the only allowed localStorage keys.
      // customGifts/customScripts come from the backend in the authenticated
      // loader effect; no cache on mount.
      const savedAuth = JSON.parse(localStorage.getItem('authState') || '{}');
      const authToken = localStorage.getItem('authToken');
      if (savedAuth.user && authToken) {
        setAuthState(savedAuth);
      } else {
        // Clear invalid auth state
        localStorage.removeItem('authState');
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
      }
    };

    loadInitialData();
  }, []);

  // Global session-expiration handler. The axios response interceptor in
  // src/services/api.ts dispatches `auth:session-expired` whenever it sees a
  // 401 (or 403 with a TOKEN_* error_code) on a non-login request. We listen
  // here and flip the app back into the "logged out" state in one place,
  // instead of every component handling 401s independently.
  useEffect(() => {
    const handleSessionExpired = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      // Idempotent: if we already showed the modal, don't stack notifications.
      setAuthState((prev) => {
        if (!prev.isAuthenticated) return prev;
        return { user: null, isAuthenticated: false, partnerConnected: false };
      });
      clearAuthStorage();
      setCurrentView('home');
      setShowAuthModal(true);
      showNotification({
        type: 'warning',
        title: '登入已過期',
        message: detail?.reason === 'invalid'
          ? '登入資訊已失效，請重新登入'
          : '為了你的帳號安全，請重新登入',
        duration: 6000
      });
    };
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, [showNotification]);

  // src/services/api.ts dispatches `billing:limit-reached` on a 429 with one of
  // our freemium cap error_codes. Send the user to the Upgrade view with the
  // cap's message as context so the paywall is handled in one place.
  useEffect(() => {
    const handleLimitReached = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setUpgradeReason(detail?.message || '已達免費方案上限，升級 Premium 可解除限制');
      setCurrentView('upgrade');
    };
    window.addEventListener('billing:limit-reached', handleLimitReached);
    return () => window.removeEventListener('billing:limit-reached', handleLimitReached);
  }, []);

  // Proactive expiration: schedule a logout when the JWT is due to expire,
  // and re-check on visibilitychange so users who put their machine to sleep
  // for days don't wake up to a "dead" page that still shows them logged in.
  useEffect(() => {
    if (!isAuthenticated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const dispatchExpired = () => {
      window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { reason: 'expired' } }));
    };

    const scheduleExpiry = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      const expiresAt = getTokenExpiry();
      if (expiresAt == null) return;
      const msUntilExpiry = expiresAt - Date.now();
      if (msUntilExpiry <= 0) {
        dispatchExpired();
        return;
      }
      // setTimeout truncates to a 32-bit int (~24.8 days). Cap the schedule.
      timer = setTimeout(dispatchExpired, Math.min(msUntilExpiry, 2_147_000_000));
    };

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const expiresAt = getTokenExpiry();
      if (expiresAt != null && expiresAt <= Date.now()) {
        dispatchExpired();
        return;
      }
      // Token still looks valid client-side — confirm with the server in case
      // it was revoked (e.g. user deleted) or the clock is skewed. Failures
      // flow through the axios interceptor, which dispatches the same event.
      apiService.getCurrentUser().catch(() => { /* interceptor handles it */ });
      scheduleExpiry();
    };

    scheduleExpiry();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated]);

  // Load authenticated data when user logs in
  useEffect(() => {
    // Only run if user is authenticated
    if (!isAuthenticated || !authUser) {
      return;
    }

    const loadAuthenticatedData = async () => {
      try {
        // Load intimacy records from backend
        try {
          const records = await apiService.getIntimateRecords();
          setIntimateRecords(records);
        } catch (error) {
          console.error('Failed to load intimate records:', error);
          // Keep empty array if API fails
        }

        // Load cycle records (period tracking)
        try {
          const cycles = await apiService.getCycleRecords();
          setCycleRecords(cycles);
        } catch (error) {
          console.error('Failed to load cycle records:', error);
        }

        // Load couple information to get partner details and journey fields
        try {
          const coupleInfo = await apiService.getCouple();

          // Load nicknames using the couple data to avoid duplicate API call
          const storedNicknames = await apiService.getNicknames(coupleInfo);
          setNicknames(storedNicknames);

          if (coupleInfo && authUser) {
            const nextPartnerConnected = !!coupleInfo.user2Nickname;
            const nextPartnerNickname = storedNicknames.partner2 || undefined;
            const nextCouplePrimaryTz = coupleInfo.primaryTimezone ?? null;
            const nextPartnerTz =
              coupleInfo.user1Id === authUser.id
                ? coupleInfo.user2Timezone ?? null
                : coupleInfo.user2Id === authUser.id
                  ? coupleInfo.user1Timezone ?? null
                  : null;

            const needsUpdate =
              authUser.partnerId !== coupleInfo.id ||
              authUser.partnerNickname !== nextPartnerNickname ||
              authUser.couplePrimaryTimezone !== nextCouplePrimaryTz ||
              authUser.partnerTimezone !== nextPartnerTz ||
              partnerConnected !== nextPartnerConnected;

            if (needsUpdate) {
              const updatedAuthState: AuthState = {
                isAuthenticated: true,
                partnerConnected: nextPartnerConnected,
                user: {
                  ...authUser,
                  partnerId: coupleInfo.id,
                  partnerNickname: nextPartnerNickname, // partner2 is always the partner's nickname
                  couplePrimaryTimezone: nextCouplePrimaryTz,
                  partnerTimezone: nextPartnerTz,
                }
              };

              setAuthState(updatedAuthState);
              localStorage.setItem('authState', JSON.stringify(updatedAuthState));
            }
            
            // Note: Nickname updates will be handled by the useEffect hook for nicknames state changes

            // Merge journey fields from backend where available
            if (
              coupleInfo.anniversaryDate ||
              coupleInfo.firstMeetDate ||
              coupleInfo.firstKissDate ||
              coupleInfo.firstKissPlace ||
              coupleInfo.firstIntimacyDate ||
              coupleInfo.firstIntimacyPlace
            ) {
              setJourneyMilestones(prev => prev.map(milestone => {
                if (milestone.type === 'meeting' && coupleInfo.firstMeetDate) {
                  return { ...milestone, date: coupleInfo.firstMeetDate };
                }
                if (milestone.type === 'first_date' && coupleInfo.anniversaryDate) {
                  return { ...milestone, date: coupleInfo.anniversaryDate };
                }
                if (milestone.type === 'first_kiss') {
                  const updated = { ...milestone };
                  if (coupleInfo.firstKissDate) {
                    updated.date = coupleInfo.firstKissDate;
                  }
                  if (coupleInfo.firstKissPlace) {
                    updated.place = coupleInfo.firstKissPlace;
                  }
                  return updated;
                }
                if (milestone.type === 'first_sex') {
                  const updated = { ...milestone };
                  if (coupleInfo.firstIntimacyDate) {
                    updated.date = coupleInfo.firstIntimacyDate;
                  }
                  if (coupleInfo.firstIntimacyPlace) {
                    updated.place = coupleInfo.firstIntimacyPlace;
                  }
                  return updated;
                }
                return milestone;
              }));
            }
          }
        } catch (coupleError) {
          console.log('No couple found or error fetching couple info:', coupleError);
          // Load nicknames even if no couple info available (will fallback to localStorage)
          try {
            const storedNicknames = await apiService.getNicknames();
            setNicknames(storedNicknames);
          } catch (nicknameError) {
            console.error('Failed to load nicknames:', nicknameError);
          }
        }

        // Load coin balance from backend
        try {
          const coinBalance = await apiService.getCoinBalance();
          setTotalCoins(coinBalance.balance);
        } catch (coinError) {
          console.error('Failed to load coin balance:', coinError);
          // Keep local value if API fails
        }

        // Load custom scripts from backend
        try {
          const scripts = await apiService.getCustomScripts();
          // Transform scripts to ensure they have the correct field names
          const transformedScripts = (scripts as ApiCustomScript[]).map((script) => ({
            id: script.id || '',
            title: script.title || '',
            category: script.category || 'romantic',
            scenario: script.scenario || '',
            location: script.location,
            script: script.script || script.content || '',
            tags: script.tags || [],
            duration: script.duration,
            image: script.thumbnailUrl,
            photos: script.photos ?? (script.thumbnailUrl ? [script.thumbnailUrl] : []),
            isCustom: script.isCustom ?? true,
            isPublic: script.isPublic,
            createdBy: script.createdBy,
            createdAt: script.createdAt
          }));
          setCustomScripts(transformedScripts);
          // Evidence for "I uploaded it but can't see it" reports: pair this
          // with the server's `custom_scripts.list {count}` to tell whether the
          // backend returned the script or the client failed to render it.
          clientLog('custom_scripts.loaded', { count: transformedScripts.length });
        } catch (scriptError) {
          console.error('Failed to load custom scripts:', scriptError);
          clientLog('custom_scripts.load_error', {
            message: scriptError instanceof Error ? scriptError.message : String(scriptError),
          }, 'error');
          // Don't fail silently — a swallowed load is exactly what made an
          // uploaded script look "lost". Tell the user it's a load hiccup, not
          // data loss, and how to recover.
          showNotification({
            type: 'warning',
            title: '劇本載入失敗',
            message: '無法載入你的自訂劇本，請下拉重新整理或稍後再試；已上傳的劇本不會遺失。',
            duration: 6000,
          });
        }

        // Load favorite scripts from backend
        try {
          const favs = await apiService.getScriptFavorites();
          setFavoriteScriptIds(new Set(favs));
        } catch (favError) {
          console.error('Failed to load script favorites:', favError);
        }

        // Load custom gifts from backend
        try {
          const gifts = await apiService.getCustomGifts();
          setCustomGifts(gifts as ApiCustomGift[]);
        } catch (giftError) {
          console.error('Failed to load custom gifts:', giftError);
        }
      } catch (error) {
        console.error('Error loading authenticated data:', error);
      }
    };

    loadAuthenticatedData();
  }, [isAuthenticated, authUser, partnerConnected, showNotification]); // Re-run when auth user changes

  // Note: Intimate records are now persisted in the backend, no localStorage needed

  // Nicknames are persisted through the explicit Save button in SettingsView,
  // not on every keystroke — see SettingsView.handleSaveSettings.

  // Backend is the source of truth for nicknames, customGifts, customScripts,
  // and totalCoins. They are never cached in localStorage — see /api/* loaders
  // in the authenticated-data effect below.

  // Photos/videos are not downloadable (see hooks/useMediaProtection). Say so
  // once per tab session — a right-click that silently does nothing reads as a
  // broken page, so the first attempt gets an explanation instead of silence.
  // Held in refs so the document listeners register once instead of on every
  // render (showNotification is re-created each render).
  const mediaBlockNotifiedRef = useRef(false);
  const mediaBlockCtxRef = useRef({ show: showNotification, view: currentView });
  mediaBlockCtxRef.current = { show: showNotification, view: currentView };

  useMediaProtection(
    useCallback(() => {
      console.debug('[media-protection] blocked save attempt');
      if (mediaBlockNotifiedRef.current) return;
      mediaBlockNotifiedRef.current = true;
      const { show, view } = mediaBlockCtxRef.current;
      clientLog('media_protection.blocked', { view });
      show({
        type: 'info',
        title: '照片受保護',
        message:
          '這裡的照片只屬於你們，已關閉右鍵儲存與拖曳下載。想留存的話，請用你自己手邊的原始檔案。',
      });
    }, []),
  );

  // Optimistic toggle for roleplay script favorites — flips local set first,
  // rolls back and notifies on API failure.
  const toggleFavoriteScript = async (scriptId: string) => {
    const wasFav = favoriteScriptIds.has(scriptId);
    setFavoriteScriptIds(prev => {
      const next = new Set(prev);
      if (wasFav) next.delete(scriptId);
      else next.add(scriptId);
      return next;
    });
    try {
      if (wasFav) {
        await apiService.removeScriptFavorite(scriptId);
      } else {
        await apiService.addScriptFavorite(scriptId);
      }
    } catch (e) {
      console.error('Failed to toggle script favorite:', e);
      setFavoriteScriptIds(prev => {
        const next = new Set(prev);
        if (wasFav) next.add(scriptId);
        else next.delete(scriptId);
        return next;
      });
      showNotification({
        type: 'error',
        title: '操作失敗',
        message: '無法更新最愛劇本，請稍後再試。',
        duration: 4000,
      });
    }
  };

  const calculateCoins = (activityType: string, duration?: string, isNewScript?: boolean): number => {
    const activity = coinActivities[activityType] || coinActivities['regular'];
    let coins = activity.baseCoins;
    
    // Apply bonus conditions
    if (activity.bonusConditions) {
      activity.bonusConditions.forEach(bonus => {
        if (bonus.condition === '使用新劇本' && isNewScript === true) coins += bonus.bonus;
        if (bonus.condition === '超過30分鐘' && duration && parseInt(duration) > 30) coins += bonus.bonus;
        if (bonus.condition === '超過1小時' && duration && parseInt(duration) > 60) coins += bonus.bonus;
      });
    }
    
    return coins;
  };

  const checkBadgeProgress = () => {
    const thisWeek = getWeeklyStats();
    const total = intimateRecords.length;
    
    let badgeProgress = '';
    let nextBadge = '';
    
    if (thisWeek < 1) {
      badgeProgress = `還需 ${1 - thisWeek} 次達成「週間戀人」徽章`;
      nextBadge = 'weekly_lovers';
    } else if (thisWeek < 3) {
      badgeProgress = `還需 ${3 - thisWeek} 次達成「熱戀情侶」徽章`;
      nextBadge = 'passionate_couple';
    } else if (thisWeek < 5) {
      badgeProgress = `還需 ${5 - thisWeek} 次達成「甜蜜無敵」徽章`;
      nextBadge = 'sweet_invincible';
    } else if (total < 10) {
      badgeProgress = `還需 ${10 - total} 次達成第10次里程碑`;
      nextBadge = 'milestone_10';
    }
    
    return { badgeProgress, nextBadge };
  };

  const updateIntimacyMilestones = useCallback(() => {
    const totalCount = intimateRecords.length;
    const milestones = [10, 20, 50, 100, 200, 500, 1000];
    
    milestones.forEach(count => {
      if (totalCount >= count) {
        const existingMilestone = journeyMilestones.find(m => 
          m.type === 'intimacy_milestone' && m.count === count
        );
        
        if (!existingMilestone) {
          const newMilestone: JourneyMilestone = {
            id: `intimacy_${count}`,
            type: 'intimacy_milestone',
            date: intimateRecords[count - 1]?.date || formatYmdInTz(new Date(), browserTz()),
            title: `親密時光第 ${count} 次`,
            description: `恭喜你們達成了 ${count} 次親密時光的里程碑！`,
            count,
            recordId: intimateRecords[count - 1]?.id
          };
          setJourneyMilestones(prev => [...prev, newMilestone].sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          ));
        }
      }
    });
  }, [intimateRecords, journeyMilestones]);

  // Update milestones based on intimacy count - separate effect
  useEffect(() => {
    if (intimateRecords.length > 0) {
      updateIntimacyMilestones();
    }
  }, [intimateRecords.length, updateIntimacyMilestones]);

  const addIntimateRecord = async (
    date: string, 
    time: string, 
    mood: string, 
    notes?: string,
    photo?: string,
    description?: string,
    duration?: string,
    location?: string,
    roleplayScript?: string,
    activityType: string = 'regular'
  ) => {
    try {
      const isNewScript = roleplayScript ? !intimateRecords.some(r => r.roleplayScript === roleplayScript) : false;
      const coinsEarned = calculateCoins(activityType, duration, isNewScript);
      
      let photoId: string | null = null;
      let photoUrl: string | null = null;

      // Upload photo if provided
      if (photo) {
        try {
          // Convert base64 data URL to File object directly (avoid CSP violation)
          const base64Data = photo.split(',')[1]; // Remove "data:image/jpeg;base64," prefix
          const mimeType = photo.split(';')[0].split(':')[1]; // Extract MIME type
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType });
          const file = new File([blob], 'photo.jpg', { type: mimeType });
          
          const photoResponse = await apiService.uploadPhoto(file, description);
          photoId = photoResponse.id;
          photoUrl = photoResponse.url;
        } catch (photoError) {
          console.error('Photo upload failed:', photoError);
          showNotification({
            type: 'warning',
            title: '照片上傳失敗',
            message: '記錄已保存，但照片上傳失敗',
            duration: 7000
          });
        }
      }
      
      // Create record using API service
      const recordData = {
        date,
        time,
        mood,
        notes,
        photo: photoUrl || undefined,        // display URL (from Supabase)
        photoId: photoId || undefined,       // persisted so it survives reload
        description,
        duration,
        location,
        roleplayScript,
        activityType
      };
      
      const newRecord = await apiService.createIntimateRecord(recordData);
      
      // Update local state
      setIntimateRecords(prev => [...prev, newRecord]);
      
      // Update coins using API service (non-blocking)
      try {
        await apiService.updateCoins(coinsEarned);
        setTotalCoins(prev => prev + coinsEarned);
      } catch (coinsError) {
        console.warn('Failed to update coins via API, using local update only:', coinsError);
        // Still update coins locally even if API fails
        setTotalCoins(prev => prev + coinsEarned);
      }
      
      // Show success notification. First-success nudge (playbook P1-3): point
      // at the natural next action once, then stay quiet.
      const firstRecord = !localStorage.getItem('nudgeFirstRecordDone');
      if (firstRecord) localStorage.setItem('nudgeFirstRecordDone', 'true');
      const { badgeProgress } = checkBadgeProgress();
      showNotification({
        type: 'success',
        title: '記錄成功！',
        message: firstRecord && !partnerConnected
          ? `${badgeProgress} 邀請另一半配對後，這些記錄會自動和 TA 共享。`
          : firstRecord
            ? `${badgeProgress} 月曆會慢慢看見你們的節奏；也可以到「我們的牆」留句想說的話。`
            : badgeProgress,
        coins: coinsEarned,
        duration: firstRecord ? 9000 : 6000
      });
    } catch (error: unknown) {
      console.error('Error adding intimate record:', error);
      showNotification({
        type: 'error',
        title: '記錄失敗',
        message: (error as Error)?.message || '無法保存記錄，請檢查網絡連接',
        duration: 8000
      });
    }
  };

  const showRecordDetails = async (recordId: number) => {
    try {
      // Find record in local state first
      const localRecord = intimateRecords.find(r => r.id === recordId);
      if (localRecord) {
        setSelectedRecord(localRecord);
        setShowRecordDetail(true);
        return;
      }
      
      // If not found locally, fetch from API
      const record = await apiService.getIntimateRecord(recordId.toString());
      setSelectedRecord(record);
      setShowRecordDetail(true);
    } catch (error) {
      console.error('Error fetching record details:', error);
      showNotification({
        type: 'warning',
        title: '載入失敗',
        message: '無法載入記錄詳情',
        duration: 3000
      });
    }
  };

  // --- 快速回應 -------------------------------------------------------------
  // Optimistic (playbook §R7): the chip fills and the sentence lands the moment
  // you tap, and rolls back with the server's own message if the write fails.
  // Lives here because `intimateRecords` and `showNotification` do.
  const setRecordResponse = useCallback(async (
    record: IntimateRecord,
    patch: { reaction?: MomentReactionKey | null; note?: string | null }
  ) => {
    if (!record.apiId) {
      showNotification({
        type: 'warning',
        title: '記錄還在同步',
        message: '這則記錄還沒同步完成，重新整理頁面後就能回應了。',
        duration: 5000,
      });
      return;
    }

    const previous = record.myResponse ?? null;
    // Mirror the server's toggle/clear rules so the chip reacts instantly.
    const nextReaction = patch.reaction === undefined
      ? previous?.reaction ?? null
      : (patch.reaction === null || patch.reaction === previous?.reaction ? null : patch.reaction);
    const nextNote = patch.note === undefined
      ? previous?.note ?? null
      : (patch.note?.trim() || null);
    const optimistic: MomentResponse | null = nextReaction === null && nextNote === null
      ? null
      : {
          reaction: nextReaction,
          note: nextNote,
          nickname: previous?.nickname ?? null,
          updated_at: new Date().toISOString(),
        };

    const apply = (fields: Partial<IntimateRecord>) =>
      setIntimateRecords(prev => prev.map(r => (r.id === record.id ? { ...r, ...fields } : r)));

    apply({ myResponse: optimistic });
    try {
      const result = await apiService.setIntimateRecordResponse(record.apiId, patch);
      apply({ myResponse: result.my_response, partnerResponse: result.partner_response });
    } catch (error) {
      apply({ myResponse: previous });
      showNotification({
        type: 'error',
        title: '回應沒有送出',
        message: error instanceof Error ? error.message : '請稍後再試一次。',
        duration: 5000,
      });
    }
  }, [showNotification]);

  // Opens the pairing invite prompt. Shared by the onboarding card and the
  // 快速回應 gate, which both need the same "invite TA" way out.
  const openPairingPrompt = useCallback(() => {
    localStorage.removeItem('pairingPromptDismissed');
    setPairingPromptDismissed(false);
    setShowPairingPrompt(true);
  }, []);

  const handleDeleteRecord = async (record: IntimateRecord) => {
    try {
      if (!record.apiId) {
        throw new Error('記錄ID缺失');
      }
      await apiService.deleteIntimateRecord(record.apiId);
      setIntimateRecords(prev => prev.filter(r => r.id !== record.id));
      setShowDeleteConfirm(false);
      setDeletingRecord(null);
      showNotification({
        type: 'success',
        title: '已刪除',
        message: '記錄已成功刪除',
        duration: 3000
      });
    } catch (error: unknown) {
      console.error('Error deleting record:', error);
      showNotification({
        type: 'error',
        title: '刪除失敗',
        message: (error as Error)?.message || '無法刪除記錄',
        duration: 5000
      });
    }
  };

  const openEditModal = (record: IntimateRecord) => {
    setEditingRecord(record);
    setShowRecordModal(true);
  };

  const openDeleteConfirm = (record: IntimateRecord) => {
    setDeletingRecord(record);
    setShowDeleteConfirm(true);
  };

  // Script management functions
  const parseScriptContent = (content: string): string => {
    // Gender-aware display-time parsing: [男]/[他] → the male partner's
    // nickname, [女]/[她] → the female partner's, [partner1]/[partner2] stay
    // viewer-relative. Falls back to the auth user's own gender when the
    // couple payload hasn't loaded it yet (e.g. just changed in Settings).
    return parseScript(content, {
      ...nicknames,
      partner1Gender: nicknames.partner1Gender || authState.user?.gender,
    });
  };

  const addCustomScript = async (
    title: string,
    category: 'romantic' | 'adventurous' | 'school' | 'bold',
    scenario: string,
    content: string,
    tags: string[] = [],
    photos?: File[],
    isPublic: boolean = true,
    location?: string,
  ) => {
    try {
      // Create script via backend API. Content is stored raw (placeholder
      // tokens intact) — parsing happens at display time so nickname/gender
      // changes propagate and both partners see the gender-correct mapping.
      const rawScript = await apiService.createCustomScript({
        title,
        category,
        scenario,
        location,
        content,
        tags,
        duration: '15-30分鐘',
        photos,
        isPublic,
      });

      // Transform the response to match RoleplayScript interface
      const typedScript = rawScript as ApiCustomScript;
      const newScript: RoleplayScript = {
        id: typedScript.id || '',
        title: typedScript.title || title,
        category: typedScript.category || category,
        scenario: typedScript.scenario || scenario,
        location: typedScript.location ?? location,
        script: typedScript.script || typedScript.content || content,
        tags: typedScript.tags || tags,
        duration: typedScript.duration || '15-30分鐘',
        image: typedScript.thumbnailUrl,
        photos: typedScript.photos ?? (typedScript.thumbnailUrl ? [typedScript.thumbnailUrl] : []),
        isCustom: true,
        isPublic: typedScript.isPublic ?? isPublic,
        createdBy: typedScript.createdBy,
        createdAt: typedScript.createdAt
      };

      // Update local state
      setCustomScripts(prev => [...prev, newScript]);
      setShowScriptUploadModal(false);
      setPendingScriptDraft(null);

      // Reward for creating content
      try {
        await apiService.updateCoins(200);
        setTotalCoins(prev => prev + 200);
      } catch (error) {
        console.warn('Failed to update coins via API, using local update only:', error);
        setTotalCoins(prev => prev + 200);
      }

      showNotification({
        type: 'success',
        title: '劇本上傳成功！',
        message: `${title} 已加入你的劇本庫`,
        coins: 200,
        duration: 5000
      });

    } catch (error) {
      console.error('Failed to create custom script:', error);
      // Hitting the free-tier script cap is an expected state, not a failure.
      // The API interceptor already fires `billing:limit-reached`, which sends
      // the user to the Upgrade view; here we close the modal so it isn't left
      // covering that view, and show a clear (non-alarming) explanation instead
      // of a red "上傳失敗" toast.
      if ((error as { error_code?: string })?.error_code === 'SCRIPT_LIMIT_REACHED') {
        // Keep the user's work — they'll be sent to Upgrade, and the modal
        // re-opens pre-filled once they go premium (see onRedeemed below).
        setPendingScriptDraft({
          title,
          category,
          scenario,
          location: location ?? '',
          content,
          tags: tags.join(', '),
          isPublic,
          photos: photos ?? [],
        });
        setShowScriptUploadModal(false);
        setEditingScript(null);
        showNotification({
          type: 'warning',
          title: '已達免費方案劇本上限',
          message:
            (error as Error)?.message ||
            '免費方案的自訂劇本數量已達上限。升級 Premium 或輸入優惠碼後即可繼續，你剛剛的劇本草稿已為你保留。',
          duration: 7000,
        });
        return;
      }
      showNotification({
        type: 'error',
        title: '劇本上傳失敗',
        message: (error as Error)?.message || '無法保存劇本到服務器，請稍後再試',
        duration: 6000
      });
    }
  };

  // Edit an existing custom script. Accepts an optional new thumbnail; when
  // provided the request goes multipart (api.ts handles the switch) and the
  // backend PUT route uploads it to Supabase storage.
  // NOTE: content is stored raw (placeholder tokens intact) and parsed at
  // display time by parseScriptContent — never bake nicknames in here.
  const updateCustomScript = async (
    id: string,
    updates: {
      title: string;
      category: 'romantic' | 'adventurous' | 'school' | 'bold';
      scenario: string;
      location?: string;
      content: string;
      tags: string[];
      photos?: File[];
      existingPhotos?: string[];
      isPublic?: boolean;
    }
  ) => {
    try {
      const rawScript = await apiService.updateCustomScript(id, {
        title: updates.title,
        category: updates.category,
        scenario: updates.scenario,
        location: updates.location,
        content: updates.content,
        tags: updates.tags,
        photos: updates.photos,
        existingPhotos: updates.existingPhotos,
        isPublic: updates.isPublic,
      });

      const typedScript = rawScript as ApiCustomScript;
      setCustomScripts(prev =>
        prev.map(s =>
          s.id === id
            ? {
                ...s,
                title: typedScript.title || updates.title,
                category: typedScript.category || updates.category,
                scenario: typedScript.scenario || updates.scenario,
                location: typedScript.location ?? updates.location ?? s.location,
                script: typedScript.script || typedScript.content || updates.content,
                tags: typedScript.tags || updates.tags,
                // Server returns canonical photos + cover; fall back to existing
                // values when this edit didn't touch the photo series.
                image: typedScript.thumbnailUrl ?? s.image,
                photos: typedScript.photos ?? s.photos,
                isPublic: typedScript.isPublic ?? updates.isPublic ?? s.isPublic,
              }
            : s
        )
      );

      setShowScriptUploadModal(false);
      setEditingScript(null);

      showNotification({
        type: 'success',
        title: '劇本已更新',
        message: `${updates.title} 的修改已保存`,
        duration: 4000,
      });
    } catch (error) {
      console.error('Failed to update custom script:', error);
      showNotification({
        type: 'error',
        title: '更新失敗',
        message: (error as Error)?.message || '無法保存修改，請稍後再試',
        duration: 6000,
      });
    }
  };

  // Delete a custom script from the edit modal. Removes it server-side and from
  // local state, then closes the modal.
  const deleteCustomScript = async (id: string) => {
    const removed = customScripts.find(s => s.id === id);
    try {
      await apiService.deleteCustomScript(id);
      setCustomScripts(prev => prev.filter(s => s.id !== id));
      setShowScriptUploadModal(false);
      setEditingScript(null);
      showNotification({
        type: 'success',
        title: '劇本已刪除',
        message: removed ? `已刪除「${removed.title}」` : '自訂劇本已刪除',
        duration: 4000,
      });
    } catch (error) {
      console.error('Failed to delete custom script:', error);
      showNotification({
        type: 'error',
        title: '刪除失敗',
        message: (error as Error)?.message || '無法刪除劇本，請稍後再試',
        duration: 6000,
      });
    }
  };

  // Unpublish a custom script straight from the marketplace detail view, so the
  // author doesn't have to hunt down the matching script in 自訂劇本 to stop
  // sharing it. Flips is_public=false and reconciles local state.
  const unpublishScript = async (id: string) => {
    await apiService.updateCustomScript(id, { isPublic: false });
    setCustomScripts(prev =>
      prev.map(s => (s.id === id ? { ...s, isPublic: false } : s))
    );
  };

  // Gift management functions
  const addCustomGift = async (title: string, description: string, cost: number, category: CoinGift['category'], icon: string) => {
    try {
      // Create gift via backend API
      const newGift = await apiService.createCustomGift({
        title,
        description,
        cost,
        category,
        icon
      }) as CoinGift;

      // Update local state
      setCustomGifts(prev => [...prev, newGift]);

      showNotification({
        type: 'success',
        title: '禮品已添加！',
        message: `${title} 已加入禮品商店`,
        duration: 3000
      });

    } catch (error) {
      console.error('Failed to create custom gift:', error);
      showNotification({
        type: 'error',
        title: '禮品添加失敗',
        message: '無法保存禮品到服務器，請稍後再試',
        duration: 5000
      });
    }
  };

  const purchaseGift = async (gift: CoinGift) => {
    if (totalCoins >= gift.cost) {
      try {
        // Update coins via backend API
        await apiService.updateCoins(-gift.cost); // Negative amount for spending
        setTotalCoins(prev => prev - gift.cost);

        showNotification({
          type: 'success',
          title: '購買成功！',
          message: `你獲得了 ${gift.title}！記得兌現承諾哦～`,
          duration: 5000
        });
      } catch (error) {
        console.error('Failed to update coins via API:', error);
        // Still update locally for immediate UI feedback
        setTotalCoins(prev => prev - gift.cost);

        showNotification({
          type: 'success',
          title: '購買成功！',
          message: `你獲得了 ${gift.title}！記得兌現承諾哦～`,
          duration: 5000
        });
      }
    } else {
      showNotification({
        type: 'warning',
        title: '金幣不足',
        message: `還需要 ${gift.cost - totalCoins} 枚金幣`,
        duration: 3000
      });
    }
  };

  const getWeeklyStats = () => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = intimateRecords.filter(record => 
      new Date(record.date) >= oneWeekAgo && new Date(record.date) <= now
    );
    return thisWeek.length;
  };




  // "Together since" date — prefers the user-set 交往日期 milestone, then
  // earliest intimate record, then the account creation date.
  const togetherSince = (() => {
    const firstDate = journeyMilestones.find(m => m.type === 'first_date')?.date;
    if (firstDate) return new Date(firstDate);
    if (intimateRecords.length > 0) {
      const earliest = intimateRecords.reduce(
        (min, r) => (r.date < min.date ? r : min),
        intimateRecords[0],
      );
      return new Date(earliest.date);
    }
    if (authState.user?.createdAt) return new Date(authState.user.createdAt);
    return null;
  })();
  const daysTogether = togetherSince
    ? Math.max(1, Math.floor((Date.now() - togetherSince.getTime()) / 86400000) + 1)
    : 0;


  // RoleplayView component moved to separate file

  const handleNicknameChange = useCallback((partner: 'partner1' | 'partner2', value: string) => {
    setNicknames(prev => ({...prev, [partner]: value}));
  }, []);

  const handleResendVerification = async () => {
    try {
      const result = await apiService.resendVerification();
      if (result?.alreadyVerified) {
        // Sync local state so the banner disappears.
        setAuthState(prev => prev.user ? { ...prev, user: { ...prev.user, email_verified: true } } : prev);
      }
      showNotification({
        type: result?.alreadyVerified ? 'info' : 'success',
        title: result?.alreadyVerified ? 'Email 已驗證' : '驗證信已寄出',
        message: result?.message || '請到信箱查收驗證連結。',
        duration: 6000,
      });
    } catch (error) {
      showNotification({
        type: 'error',
        title: '寄送失敗',
        message: (error as Error)?.message || '無法重寄驗證信，請稍後再試。',
        duration: 6000,
      });
    }
  };

  // SettingsView component moved to separate file

  // 4-tab IA: 今天 (what matters now) / 對話 (all conversation & counseling) /
  // 我們 (relationship memory: calendar+timeline) / 成長 (stats, AI patterns,
  // milestones). 角色扮演/心理諮商/真實故事 are no longer their own bottom tabs —
  // they nest as entry cards inside 對話/成長 (and 我們的牆/愛情旅程 inside 我們),
  // per the playbook's 6-tab cap / elevator-test rule.
  // In counselor mode the couple nav is fully replaced by the single 諮商工作台
  // tab — the two role contexts never share a nav bar (confirmed product stance).
  const navItems = counselorActive
    ? [{ id: 'counselor', label: '諮商工作台', icon: HeartHandshake }]
    : [
        { id: 'home', label: '今天', icon: HomeIcon },
        { id: 'talk', label: '對話', icon: MessageCircle },
        { id: 'us', label: '我們', icon: Calendar },
        { id: 'grow', label: '成長', icon: TrendingUp },
        // Pricing is a sales surface for visitors; signed-in users upgrade via the
        // dedicated 'upgrade' view instead, so this tab is logged-out only.
        ...(!authState.isAuthenticated ? [{ id: 'pricing', label: 'Premium', icon: Crown }] : []),
      ];

  const renderView = () => {
    // Show login prompt for private content when not authenticated
    if (!authState.isAuthenticated) {
      switch (currentView) {
        case 'settings': return <SettingsView
          nicknames={nicknames}
          handleNicknameChange={handleNicknameChange}
          journeyMilestones={journeyMilestones}
          setJourneyMilestones={setJourneyMilestones}
          authState={authState}
          setShowAuthModal={setShowAuthModal}
          onAuthStateUpdate={setAuthState}
          showNotification={showNotification}
          customMemoryQuestions={customMemoryQuestions}
          setCustomMemoryQuestions={setCustomMemoryQuestions}
          customEmotions={customEmotions}
          setCustomEmotions={setCustomEmotions}
        />;
        // Therapist directory is browseable (and applicable) while logged out;
        // booking a consultation prompts for login inside the modal.
        case 'therapists': return <TherapistsView authState={authState} showNotification={showNotification} />;
        // 真實故事 renders the real view logged-out too (it IS the public
        // growth surface); write actions prompt sign-in.
        case 'stories': return (
          <StoriesView
            authState={authState}
            showNotification={showNotification}
            setShowAuthModal={setShowAuthModal}
            onFindTherapist={() => setCurrentView('therapists')}
          />
        );
        // Each nav tab previews its own feature (read-only) instead of all
        // falling through to one generic login wall. See LoggedOutPreview.
        default: return <LoggedOutPreview view={currentView} onSignUp={() => setShowAuthModal(true)} scripts={defaultRoleplayScripts} onNavigate={setCurrentView} />;
      }
    }

    // Show authenticated content
    switch (currentView) {
      case 'home':
        return (
          <HomeView
            authState={authState}
            showNotification={showNotification}
            hasFirstEntry={intimateRecords.length > 0 || localStorage.getItem('gettingStartedEventOpened') === 'true'}
            onPickCompanion={() => setShowCompanionOnboarding(true)}
            onInvitePartner={openPairingPrompt}
            onAddRecord={() => {
              setPendingAddRecord(true);
              setCurrentView('us');
            }}
            onOpenEvents={() => {
              localStorage.setItem('gettingStartedEventOpened', 'true');
              setCurrentView('events');
            }}
            onNudgePartner={partnerConnected ? () => setShowIntimacyRequestForm(true) : undefined}
            onGoToWall={() => setCurrentView('wall')}
            onGoToGrow={() => setCurrentView('grow')}
            onGoToActivity={() => setCurrentView('activity')}
          />
        );
      case 'grow':
      case 'achievements':
        return (
          <GrowView
            authState={authState}
            onInvitePartner={openPairingPrompt}
            onNavigate={setCurrentView}
          />
        );
      case 'record':
      case 'us':
        return (
          <div className="space-y-4">
          <CalendarView
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            intimateRecords={intimateRecords}
            setIntimateRecords={setIntimateRecords}
            cycleRecords={cycleRecords}
            setCycleRecords={setCycleRecords}
            authState={authState}
            calendarMonth={calendarMonth}
            setCalendarMonth={setCalendarMonth}
            editingRecord={editingRecord}
            setEditingRecord={setEditingRecord}
            showRecordModal={showRecordModal}
            setShowRecordModal={setShowRecordModal}
            setSelectedRecord={setSelectedRecord}
            setShowRecordDetail={setShowRecordDetail}
            setDayPickerDate={setDayPickerDate}
            setDayPickerRecords={setDayPickerRecords}
            setCurrentView={setCurrentView}
            addIntimateRecord={addIntimateRecord}
            showNotification={showNotification}
            showRecordDetails={showRecordDetails}
            openDeleteConfirm={openDeleteConfirm}
            defaultRoleplayScripts={defaultRoleplayScripts}
            customScripts={customScripts}
            togetherSince={togetherSince}
            daysTogether={daysTogether}
            primaryTimezone={primaryTimezone}
            onNudgePartner={partnerConnected ? () => setShowIntimacyRequestForm(true) : undefined}
            setRecordResponse={setRecordResponse}
            partnerNickname={nicknames.partner2 || '對方'}
            autoOpenAddRecord={pendingAddRecord}
            onAutoOpenAddRecordConsumed={() => setPendingAddRecord(false)}
          />
          </div>
        );
      case 'shop': return (
        <CoinShopView
          totalCoins={totalCoins}
          defaultGifts={defaultGifts}
          customGifts={customGifts}
          addCustomGift={addCustomGift}
          purchaseGift={purchaseGift}
        />
      );
      case 'foreplay':
      case 'games':
        return <GamesView
        totalCoins={totalCoins}
        customMemoryQuestions={customMemoryQuestions}
        customEmotions={customEmotions}
        setTotalCoins={setTotalCoins}
        showNotification={showNotification}
      />;
      // 好好說話：merged tab (playbook §6 Q1). Two sub-views share one nav
      // slot: 說開一件事 (the old 衝突事件) and 接住情緒與檢查 (the old
      // 和諧相處). 'events' / 'conflict' stay valid view ids so deep links
      // (notification taps, reload persistence) keep working.
      // 對話 lands straight on 說開一件事 — its core — rather than on a hub
      // screen you have to click past. The other four destinations live in the
      // TalkSwitcher, a thin sticky row present on every 對話-family view so you
      // can hop between them without going back. Each destination still owns the
      // whole screen; the 對話 tab stays lit throughout (nav-highlight map above).
      case 'communicate':
      case 'talk':
      case 'events':
        return (
          <div>
            <TalkSwitcher current="events" onNavigate={setCurrentView} />
            <EventsView
              authState={authState}
              showNotification={showNotification}
              initialEventId={pendingEventId}
              onInitialEventConsumed={() => setPendingEventId(null)}
              initialSubView={pendingEventsCompose ? 'compose' : null}
              onInitialSubViewConsumed={() => setPendingEventsCompose(false)}
              onInvitePartner={() => {
                localStorage.removeItem('pairingPromptDismissed');
                setPairingPromptDismissed(false);
                setShowPairingPrompt(true);
              }}
              onNavigate={setCurrentView}
            />
          </div>
        );
      case 'conflict':
        return (
          <div>
            <TalkSwitcher current="conflict" onNavigate={setCurrentView} />
            <ConflictView
              showNotification={showNotification}
              partnerConnected={partnerConnected}
              onNavigate={setCurrentView}
              onComposeEvent={() => {
                setPendingEventsCompose(true);
                setCurrentView('events');
              }}
            />
          </div>
        );
      // roleplay / wall / therapists are 對話 destinations too, so they carry the
      // switcher — you can jump straight to a sibling from here rather than going
      // back. (They're also reachable from the profile menu; the switcher's
      // active chip keeps you oriented either way.)
      case 'roleplay': return (
        <div>
          <TalkSwitcher current="roleplay" onNavigate={setCurrentView} />
          <RoleplayView
            defaultRoleplayScripts={defaultRoleplayScripts}
            customScripts={customScripts}
            roleplayFilter={roleplayFilter}
            setRoleplayFilter={setRoleplayFilter}
            setShowScriptUploadModal={setShowScriptUploadModal}
            parseScriptContent={parseScriptContent}
            addIntimateRecord={addIntimateRecord}
            onEditScript={(script) => {
              setEditingScript(script);
              setShowScriptUploadModal(true);
            }}
            showNotification={showNotification}
            favoriteScriptIds={favoriteScriptIds}
            onToggleFavorite={toggleFavoriteScript}
            onUnpublishScript={unpublishScript}
            initialScriptTitle={pendingScriptTitle}
            onInitialScriptConsumed={() => setPendingScriptTitle(null)}
            renderGames={() => <GamesView
              totalCoins={totalCoins}
              customMemoryQuestions={customMemoryQuestions}
              customEmotions={customEmotions}
              setTotalCoins={setTotalCoins}
              showNotification={showNotification}
            />}
          />
        </div>
      );
      case 'journey': return (
        <OurJourneyView
          journeyMilestones={journeyMilestones}
          intimateRecords={intimateRecords}
          setCurrentView={setCurrentView}
        />
      );
      case 'wall': return (
        <div>
          <TalkSwitcher current="wall" onNavigate={setCurrentView} />
          <WallView
            authState={authState}
            nicknames={nicknames}
            defaultWallExamples={defaultWallExamples}
            moodTags={WALL_MOOD_TAGS}
            showNotification={showNotification}
          />
        </div>
      );
      case 'settings': return <SettingsView
        nicknames={nicknames}
        handleNicknameChange={handleNicknameChange}
        journeyMilestones={journeyMilestones}
        setJourneyMilestones={setJourneyMilestones}
        authState={authState}
        setShowAuthModal={setShowAuthModal}
        onAuthStateUpdate={setAuthState}
        showNotification={showNotification}
        customMemoryQuestions={customMemoryQuestions}
        setCustomMemoryQuestions={setCustomMemoryQuestions}
        customEmotions={customEmotions}
        setCustomEmotions={setCustomEmotions}
        cycleRecords={cycleRecords}
        onCycleRecordsChange={setCycleRecords}
      />;
      case 'activity': return <ActivityView showNotification={showNotification} />;
      case 'help': return <HelpView onFeedback={() => setCurrentView('feedback')} />;
      case 'stories': return (
        <StoriesView
          authState={authState}
          showNotification={showNotification}
          setShowAuthModal={setShowAuthModal}
          onFindTherapist={() => setCurrentView('therapists')}
        />
      );
      case 'intimacy-history': return (
        <IntimacyRequestsHistory
          authState={authState}
          partnerNickname={nicknames.partner2}
          onViewScript={(title) => {
            setPendingScriptTitle(title);
            setCurrentView('roleplay');
          }}
          onSendInvite={() => setShowIntimacyRequestForm(true)}
        />
      );
      // 'pricing' is the logged-out Premium tab; once signed in it becomes the
      // real upgrade flow rather than dropping to the default view.
      case 'pricing':
      case 'upgrade': return <UpgradeView
        reason={upgradeReason}
        showNotification={showNotification}
        onRedeemed={() => {
          // Now premium server-side. If a cap-blocked script draft is waiting,
          // hop back to Roleplay and re-open the upload modal pre-filled.
          if (pendingScriptDraft) {
            setUpgradeReason(null);
            setCurrentView('roleplay');
            setShowScriptUploadModal(true);
          }
        }}
      />;
      case 'therapists': return (
        <div>
          <TalkSwitcher current="therapists" onNavigate={setCurrentView} />
          <TherapistsView authState={authState} showNotification={showNotification} mode="user" />
        </div>
      );
      // 諮商師工作台 — the counselor role's own page. Only reachable while
      // counselorActive (guarded by the effect above); no TalkSwitcher, since
      // this isn't part of the couple's 對話 family. When not active it renders
      // nothing for the one frame before the guard effect redirects to 今天.
      case 'counselor': return counselorActive ? (
        <TherapistsView authState={authState} showNotification={showNotification} mode="counselor" clientsFocusToken={counselorClientsFocus} clientsFocusCoupleId={counselorClientsTargetCoupleId} />
      ) : null;
      case 'feedback': return <FeedbackView authState={authState} showNotification={showNotification} setShowAuthModal={setShowAuthModal} />;
      case 'love-language': return <LoveLanguageView authState={authState} showNotification={showNotification} setShowAuthModal={setShowAuthModal} />;
      default: return <GamesView
        totalCoins={totalCoins}
        customMemoryQuestions={customMemoryQuestions}
        customEmotions={customEmotions}
        setTotalCoins={setTotalCoins}
        showNotification={showNotification}
      />;
    }
  };

  const closeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };


  const primaryTimezone = getPrimaryTimezone({
    couplePrimaryTz: authState.user?.couplePrimaryTimezone,
    userTz: authState.user?.timezone,
  });

  // ECPay redirected the browser back here after checkout. The pass was already
  // granted server-to-server; this screen just confirms and returns to the app.
  if (isBillingResult) {
    return (
      <BillingResultView
        onDone={() => {
          window.history.replaceState(null, '', '/');
          setIsBillingResult(false);
          setCurrentView('home');
        }}
      />
    );
  }

  // ECPay redirected back after a video-session payment. The session was marked
  // paid server-to-server; this screen just confirms and returns to the app.
  if (isBookingResult) {
    return (
      <BookingResultView
        onDone={() => {
          window.history.replaceState(null, '', '/');
          setIsBookingResult(false);
          setCurrentView('therapists');
        }}
      />
    );
  }

  return (
    <FeatureFlagsProvider>
    <TimezoneProvider value={primaryTimezone}>
    <EngineerModeProvider isPremium={billingStatus?.tier === 'premium'}>
    {/* 工程師模式的文字翻譯引擎：只在模式生效時運作，把畫面文案換成黑話。 */}
    <EngineerTextEngine />
    <div className="min-h-screen bg-petal-cream">
      {/* Header */}
      <Header
        authState={authState}
        totalCoins={totalCoins}
        onShowAuthModal={() => setShowAuthModal(true)}
        onLogout={handleLogout}
        onShowIntimacyRequest={() => setShowIntimacyRequestForm(true)}
        onShowNotifications={() => setShowNotificationInbox(true)}
        onShowCoinShop={() => setCurrentView('shop')}
        onShowSettings={() => setCurrentView('settings')}
        onShowActivity={() => setCurrentView('activity')}
        onShowJourney={() => setCurrentView('journey')}
        onShowStories={() => setCurrentView('stories')}
        onShowRoleplay={() => setCurrentView('roleplay')}
        onShowWall={() => setCurrentView('wall')}
        onShowTherapists={() => setCurrentView('therapists')}
        onShowIntimacyHistory={() => setCurrentView('intimacy-history')}
        onShowFeedback={() => setCurrentView('feedback')}
        onShowHelp={() => setCurrentView('help')}
        onShowLoveLanguage={() => setCurrentView('love-language')}
        onShowDeepDive={() => setDeepDiveIntent({ type: 'start' })}
        onShowUpgrade={() => { setUpgradeReason(null); setCurrentView('upgrade'); }}
        billingStatus={billingStatus}
        isTherapist={isTherapist}
        counselorMode={counselorMode}
        onToggleCounselorMode={handleToggleCounselorMode}
      />

      {/* 情緒深潛 resume banner — dismissible, does not re-fire same session (R4).
          Prefers the caller's own unfinished journey; otherwise surfaces a
          journey a partner shared with them so the partner side is reachable. */}
      {isAuthenticated && !deepDiveBannerDismissed && !deepDiveIntent && (activeDeepDive || incomingDeepDive) && (
        <div className="max-w-2xl mx-auto px-4 mt-3">
          <DeepDiveResumeBanner
            journey={activeDeepDive || { id: incomingDeepDive!.id, role: 'partner', status: incomingDeepDive!.status }}
            fromNickname={!activeDeepDive ? incomingDeepDive?.from_nickname : null}
            onResume={() => setDeepDiveIntent({ type: 'open', journeyId: (activeDeepDive || incomingDeepDive)!.id })}
            onDismiss={() => setDeepDiveBannerDismissed(true)}
          />
        </div>
      )}

      {/* 情緒深潛 full-screen journey layer */}
      <DeepDiveJourneyView
        open={!!deepDiveIntent}
        intent={deepDiveIntent}
        onClose={() => setDeepDiveIntent(null)}
        onNotify={showNotification}
        onChanged={refreshActiveDeepDive}
        companionShortName={resolveCompanion(authState.user?.selected_therapist).name}
      />

      {/* Notification Container */}
      <NotificationContainer
        notifications={notifications}
        onClose={closeNotification}
      />

      {/* One-time AI companion (諮商師) onboarding picker */}
      {needsCompanionPick && !showPairingInvitation && (
        <AiCompanionOnboarding
          onDone={(companionId) => {
            setShowCompanionOnboarding(false);
            setAuthState((prev) => {
              const next: AuthState = {
                ...prev,
                user: prev.user ? { ...prev.user, selected_therapist: companionId } : prev.user,
              };
              localStorage.setItem('authState', JSON.stringify(next));
              return next;
            });
            showNotification({
              type: 'success',
              title: '已選擇 AI 諮商師',
              message: `${resolveCompanion(companionId).name} 之後會在對話和牆上陪你們聊`,
              duration: 5000,
            });
          }}
          onDismiss={() => setShowCompanionOnboarding(false)}
        />
      )}

      {/* Pairing Invitation Handler */}
      {showPairingInvitation && pairingInvitationToken && (
        <PairingInvitationHandler
          token={pairingInvitationToken}
          onAccepted={handlePairingInvitationAccepted}
          onRejected={handlePairingInvitationRejected}
          onClose={handlePairingInvitationClosed}
          authState={authState}
          setShowAuthModal={setShowAuthModal}
          showNotification={showNotification}
        />
      )}

      {showPairingPrompt && (
        <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-petal-cream rounded-md p-7 max-w-md w-full shadow-petal border border-petal-rule">
            <div className="text-center mb-6 pb-5 border-b border-petal-rule">
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2">
                — 配對伴侶
              </div>
              <h2 className="font-display text-2xl font-light tracking-tight text-petal-ink mb-2">
                邀請<em className="not-italic font-light italic text-pink-600">你的伴侶</em>
              </h2>
              <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
                配對後，日曆、親密紀錄與成就將自動同步。
              </p>
            </div>

            {pairingPromptSent ? (
              <div className="py-2">
                <p className="font-display italic text-petal-sage-deep mb-1 text-center">邀請已寄出</p>
                <p className="font-body text-sm text-petal-muted mb-4 text-center">連結 7 天內有效。</p>
                {pairingPromptInvite && (
                  <PairingInviteShare
                    link={pairingPromptInvite.link}
                    recipientEmail={pairingPromptInvite.email}
                    emailSent={pairingPromptInvite.emailSent}
                    className="mb-4"
                  />
                )}
                <button
                  onClick={() => {
                    setShowPairingPrompt(false);
                    setPairingPromptSent(false);
                    setPairingPromptEmail('');
                    setPairingPromptInvite(null);
                  }}
                  className="font-body text-sm text-petal-muted hover:text-petal-ink transition-colors"
                >
                  關閉
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">伴侶的 Email</label>
                  <input
                    type="email"
                    value={pairingPromptEmail}
                    onChange={(e) => setPairingPromptEmail(e.target.value)}
                    placeholder="partner@example.com"
                    className="w-full border border-petal-rule rounded-md px-3 py-2.5 focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink"
                    disabled={pairingPromptSending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && pairingPromptEmail.trim()) {
                        (async () => {
                          setPairingPromptSending(true);
                          try {
                            const result = await apiService.sendPairingInvitation({ recipientEmail: pairingPromptEmail.trim() });
                            setPairingPromptInvite(buildPairingInviteState(result, pairingPromptEmail.trim()));
                            setPairingPromptSent(true);
                            // Flip the reminder banner to its 等待中 state
                            // without needing a reload.
                            refreshPendingPairingInvite();
                          } catch (err) {
                            showNotification({ type: 'error', title: '發送失敗', message: (err as Error)?.message || '請稍後再試', duration: 6000 });
                          } finally {
                            setPairingPromptSending(false);
                          }
                        })();
                      }
                    }}
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!pairingPromptEmail.trim()) return;
                    setPairingPromptSending(true);
                    try {
                      const result = await apiService.sendPairingInvitation({ recipientEmail: pairingPromptEmail.trim() });
                      setPairingPromptInvite(buildPairingInviteState(result, pairingPromptEmail.trim()));
                      setPairingPromptSent(true);
                      refreshPendingPairingInvite();
                    } catch (err) {
                      showNotification({ type: 'error', title: '發送失敗', message: (err as Error)?.message || '請稍後再試', duration: 6000 });
                    } finally {
                      setPairingPromptSending(false);
                    }
                  }}
                  disabled={pairingPromptSending || !pairingPromptEmail.trim()}
                  className={`w-full py-3 rounded-md font-display italic text-base transition-colors ${
                    pairingPromptSending || !pairingPromptEmail.trim()
                      ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                      : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
                  }`}
                >
                  {pairingPromptSending ? '發送中…' : '發送邀請連結 →'}
                </button>
                <button
                  onClick={() => {
                    setCurrentView('settings');
                    setShowPairingPrompt(false);
                  }}
                  className="w-full text-petal-ink py-2 font-body text-sm border border-petal-rule rounded-md hover:bg-petal-cream-2 transition-colors"
                >
                  使用配對碼配對
                </button>
                <button
                  onClick={() => {
                    setShowPairingPrompt(false);
                    setPairingPromptDismissed(true);
                    localStorage.setItem('pairingPromptDismissed', 'true');
                  }}
                  className="w-full text-petal-muted hover:text-petal-ink py-1 font-body text-xs transition-colors"
                >
                  稍後再說
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-10">
        {/* Tagline */}
        <div
          className={`text-center overflow-hidden transition-all duration-700 ease-in-out ${
            showTagline ? 'max-h-12 opacity-100 mb-10' : 'max-h-0 opacity-0 mb-0'
          }`}
        >
          <p className="font-display italic font-light text-base text-petal-muted">
            為熱戀中的你們 — <span className="text-petal-ink">記錄每一段親密時光</span>
          </p>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap justify-center gap-1.5 mb-10">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              currentView === item.id ||
              (item.id === 'talk' && ['communicate', 'conflict', 'events', 'roleplay', 'therapists', 'wall'].includes(currentView)) ||
              (item.id === 'us' && currentView === 'record') ||
              // 'achievements' is a legacy deep-link id that now renders GrowView,
              // so it must light up 成長 — not 我們.
              (item.id === 'grow' && ['achievements', 'stories'].includes(currentView));
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                data-testid={`nav-tab-${item.id}`}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full transition-colors border ${
                  isActive
                    ? 'bg-petal-ink text-petal-cream border-petal-ink'
                    : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
                }`}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="font-body text-[13px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Soft email-verification reminder — non-blocking; users can keep using
            the app. Shows only while authenticated and not yet verified. */}
        {authState.isAuthenticated && authState.user?.email_verified === false && (
          <div className="max-w-6xl mx-auto mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-petal-rose-soft/30 border border-petal-rose-soft rounded-md px-4 py-3">
              <p className="flex-1 font-body text-sm text-petal-ink">
                請驗證你的 Email（{authState.user?.email}）以確保帳號安全。沒收到信？可以重新寄送。
              </p>
              <button
                onClick={handleResendVerification}
                data-testid="resend-verification-button"
                className="shrink-0 px-4 py-1.5 bg-petal-ink text-petal-cream rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
              >
                重新寄送驗證信
              </button>
            </div>
          </div>
        )}

        {/* Proactive Premium-expiry reminder — non-blocking, dismissible; shows
            only when Premium is within 7 days of lapsing. Hidden on the upgrade
            view itself (that page already shows expiry + a 續購 button). */}
        {authState.isAuthenticated && currentView !== 'upgrade' && !counselorActive && (
          <PremiumExpiryBanner
            status={billingStatus}
            onRenew={() => { setUpgradeReason(null); setCurrentView('upgrade'); }}
          />
        )}

        {/* Standing 未配對 reminder — non-blocking, snoozes for 7 days. Hidden
            on 設定 (its own pairing panel lives there) and while the pairing
            modal is up, so we never stack two asks for the same thing. */}
        {authState.isAuthenticated && !partnerConnected && currentView !== 'settings' && !showPairingPrompt && !showPairingInvitation && !counselorActive && (
          <PairingReminderBanner
            invite={pendingPairingInvite}
            onInvite={() => {
              localStorage.removeItem('pairingPromptDismissed');
              setPairingPromptDismissed(false);
              setShowPairingPrompt(true);
            }}
            onUseCode={() => setCurrentView('settings')}
            onResend={handleResendPairingInvite}
          />
        )}

        {/* Main Content */}
        <div className="max-w-6xl mx-auto">
          {renderView()}
        </div>

        {/* Logged-out design philosophy — the three communication principles that
            run through the whole app, so a visitor can recognise their own
            struggle and anticipate how Twogether helps before signing up.
            Hidden on the therapists sub-page (its own context). */}
        {!authState.isAuthenticated && currentView !== 'therapists' && (
          <CommunicationPrinciples onSignUp={() => setShowAuthModal(true)} />
        )}

        {/* Logged-out social proof — real approved reviews, or 3 defaults until
            any exist. Hidden on the therapists sub-page (its own context). */}
        {!authState.isAuthenticated && currentView !== 'therapists' && (
          <Testimonials />
        )}

        {/* Therapist entry — low-key footer link, kept out of the way of
            regular couples but discoverable for practitioners. */}
        {!authState.isAuthenticated && currentView !== 'therapists' && (
          <footer className="max-w-6xl mx-auto mt-16 pt-6 border-t border-petal-rule text-center safe-pb">
            <p className="font-body text-xs text-petal-muted">
              你是諮商師？
              <button
                onClick={() => setCurrentView('therapists')}
                data-testid="therapist-footer-link"
                className="text-pink-600 hover:text-pink-700 underline underline-offset-2"
              >
                登入
              </button>
              <span className="mx-1.5 text-petal-rule">·</span>
              <a
                href="/therapist-signup"
                data-testid="therapist-signup-link"
                className="text-pink-600 hover:text-pink-700 underline underline-offset-2"
              >
                申請入駐
              </a>
            </p>
          </footer>
        )}

        {/* Release line — version / environment / build time / commit hash,
            baked in by vite.config.ts `define` so every deployed commit
            shows its own build metadata. */}
        <footer className="max-w-6xl mx-auto mt-10 pb-4 text-center safe-pb">
          <p className="font-body text-[11px] text-petal-muted/80" data-testid="build-info">
            v{__APP_VERSION__} | {import.meta.env.MODE} |{' '}
            {new Date(__BUILD_TIME__).toLocaleString('zh-TW')} | {__COMMIT_HASH__}
          </p>
        </footer>
      </div>

      {/* Modals */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          showNotification={showNotification}
          handleLogin={handleLogin}
          handleRegister={handleRegister}
          handlePartnerConnect={handlePartnerConnect}
        />
      )}
      {showScriptUploadModal && (
        <ErrorBoundary
          context="script-upload-modal"
          inline
          onReset={() => { setShowScriptUploadModal(false); setEditingScript(null); setPendingScriptDraft(null); }}
        >
          <ScriptUploadModal
            editingScript={editingScript}
            pendingScriptDraft={pendingScriptDraft}
            onClose={() => {
              setShowScriptUploadModal(false);
              setEditingScript(null);
              setPendingScriptDraft(null);
            }}
            addCustomScript={addCustomScript}
            updateCustomScript={updateCustomScript}
            onDeleteScript={deleteCustomScript}
            onRequireUpgrade={(draft, reason) => {
              // Preserve the in-progress form (same flow as the script cap),
              // then surface the paywall. The modal re-opens pre-filled after
              // the user goes premium (see onRedeemed).
              setPendingScriptDraft(draft);
              setShowScriptUploadModal(false);
              setEditingScript(null);
              setUpgradeReason(reason || '升級 Premium 即可使用 AI 角色辨識');
              setCurrentView('upgrade');
            }}
          />
        </ErrorBoundary>
      )}
      
      {/* Intimacy Request Form */}
      <IntimacyRequestForm
        isOpen={showIntimacyRequestForm}
        onClose={() => setShowIntimacyRequestForm(false)}
        scripts={[...defaultRoleplayScripts, ...customScripts]}
        onSuccess={() => {
          showNotification({
            type: 'success',
            title: '親密邀請已發送',
            message: '你的邀請已經發送給伴侶',
            duration: 3000,
          });
        }}
      />
      
      {/* Notification Inbox */}
      <NotificationInbox
        isOpen={showNotificationInbox}
        onClose={() => setShowNotificationInbox(false)}
        unreadCount={unreadNotificationCount}
        onUnreadCountChange={setUnreadNotificationCount}
        onNavigate={(view, payload) => {
          if (view === 'events' && payload) {
            setPendingEventId(payload);
          }
          // 情緒深潛 notification → open the deep-dive layer over the current view
          // rather than routing to a plain page. Resume the caller's active /
          // incoming journey when we know it; otherwise start (which resumes an
          // open one server-side). Don't change currentView.
          if (view === 'deep-dive') {
            const target = activeDeepDive || incomingDeepDive;
            setDeepDiveIntent(target ? { type: 'open', journeyId: target.id } : { type: 'start' });
            return;
          }
          // 諮商師被設為專屬諮商師 → enter the 諮商工作台 and jump to 我輔導的伴侶.
          // Flip counselor mode on (guard effect keeps it only if this account is
          // actually a therapist) and bump the focus token so the clients panel
          // auto-opens the couple that just added them.
          if (view === 'counselor') {
            setCounselorMode(true);
            setCounselorClientsTargetCoupleId(payload || null);
            setCounselorClientsFocus((n) => n + 1);
          }
          setCurrentView(view);
        }}
      />

      {/* Day Picker Modal — shown when a calendar day has 2+ records */}
      {dayPickerDate && (
        <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-petal-cream rounded-md shadow-petal max-w-md w-full max-h-[80vh] overflow-y-auto overscroll-contain border border-petal-rule">
            <div className="p-5 sm:p-6">
              <div className="flex justify-between items-end mb-5 pb-4 border-b border-petal-rule">
                <div>
                  <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-1">
                    — {dayPickerDate}
                  </div>
                  <h3 className="font-display text-2xl font-light tracking-tight text-petal-ink">
                    這天的<em className="not-italic font-light italic text-pink-600">記錄</em>
                  </h3>
                </div>
                <button
                  onClick={() => { setDayPickerDate(null); setDayPickerRecords([]); }}
                  className="text-petal-muted hover:text-petal-ink text-2xl font-light transition-colors leading-none"
                >
                  ×
                </button>
              </div>
              <div className="space-y-1">
                {dayPickerRecords.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => {
                      setDayPickerDate(null);
                      setDayPickerRecords([]);
                      showRecordDetails(record.id);
                    }}
                    className="w-full text-left grid grid-cols-[36px_1fr] gap-3 py-3 px-2 -mx-2 rounded-md hover:bg-petal-cream-2/40 transition-colors"
                  >
                    <div className="text-2xl opacity-80 saturate-75 leading-none">{record.mood}</div>
                    <div className="min-w-0">
                      <div className="font-display italic font-light text-sm text-petal-muted mb-0.5">
                        {record.time}
                      </div>
                      {record.description && (
                        <p className="font-body text-[14px] leading-relaxed text-petal-ink truncate">
                          {record.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Detail Modal */}
      {showRecordDetail && selectedRecord && (
        <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-petal-cream rounded-md shadow-petal max-w-2xl w-full max-h-[90vh] overflow-y-auto overscroll-contain border border-petal-rule">
            <div className="p-5 sm:p-6 md:p-8">
              <div className="flex justify-between items-end mb-8 pb-5 border-b border-petal-rule">
                <div>
                  <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
                    — 詳情
                  </div>
                  <h3 className="font-display text-3xl font-light tracking-tight text-petal-ink">
                    親密<em className="not-italic font-light italic text-pink-600">時光</em>
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowRecordDetail(false); openEditModal(selectedRecord); }}
                    className="text-petal-muted hover:text-petal-ink transition-colors p-1"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => { setShowRecordDetail(false); openDeleteConfirm(selectedRecord); }}
                    className="text-petal-muted hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setShowRecordDetail(false)}
                    className="text-petal-muted hover:text-petal-ink text-2xl font-light transition-colors leading-none ml-1"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="text-4xl">{selectedRecord.mood}</div>
                  <div>
                    <div className="font-display text-xl font-medium text-petal-ink">
                      {selectedRecord.date} {selectedRecord.time}
                    </div>
                  </div>
                </div>

                {selectedRecord.photo && (
                  <div className="text-center">
                    <img
                      src={selectedRecord.photo}
                      alt="記憶照片"
                      className="max-w-full max-h-96 rounded-md mx-auto border border-petal-rule"
                    />
                  </div>
                )}

                {selectedRecord.description && (
                  <div>
                    <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">描述</h4>
                    <p className="font-body text-[15px] leading-relaxed text-petal-ink">
                      {selectedRecord.description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedRecord.duration && (
                    <div className="flex items-center space-x-2">
                      <Clock className="w-5 h-5 text-petal-rose-deep" />
                      <span className="font-body text-sm text-petal-ink">持續時間: {selectedRecord.duration}</span>
                    </div>
                  )}
                  {selectedRecord.location && (
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-5 h-5 text-petal-rose-deep" />
                      <span className="font-body text-sm text-petal-ink">地點: {selectedRecord.location}</span>
                    </div>
                  )}
                  {selectedRecord.roleplayScript && (
                    <button
                      type="button"
                      onClick={() => {
                        const title = selectedRecord.roleplayScript!;
                        setShowRecordDetail(false);
                        setPendingScriptTitle(title);
                        setCurrentView('roleplay');
                      }}
                      className="flex items-center space-x-2 text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-petal-sage-deep/40 rounded-sm -mx-1 px-1"
                    >
                      <Play className="w-5 h-5 text-petal-sage-deep" />
                      <span className="font-body text-sm text-petal-ink group-hover:text-petal-sage-deep group-hover:underline underline-offset-2 transition-colors">劇本: {selectedRecord.roleplayScript}</span>
                    </button>
                  )}
                  {!!selectedRecord.coinsEarned && (
                    <div className="flex items-center space-x-2">
                      <Coins className="w-5 h-5 text-yellow-500" />
                      <span className="font-body text-sm text-petal-ink">獲得金幣: {selectedRecord.coinsEarned}</span>
                    </div>
                  )}
                </div>

                {selectedRecord.notes && (
                  <div>
                    <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">備註</h4>
                    <p className="font-display italic font-light text-sm text-petal-ink-soft pl-3 border-l border-petal-rose-soft leading-relaxed">
                      "{selectedRecord.notes}"
                    </p>
                  </div>
                )}

                <div>
                  <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">快速回應</h4>
                  <MomentResponseBar
                    // `selectedRecord` is a snapshot taken when the modal opened,
                    // so read the live row for the parts that change under it.
                    record={intimateRecords.find(r => r.id === selectedRecord.id) ?? selectedRecord}
                    partnerConnected={partnerConnected}
                    partnerNickname={nicknames.partner2 || '對方'}
                    variant="detail"
                    onRespond={setRecordResponse}
                    onInvitePartner={() => { setShowRecordDetail(false); openPairingPrompt(); }}
                    timezone={primaryTimezone}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingRecord && (
        <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-petal-cream rounded-md shadow-petal max-w-md w-full border border-petal-rule">
            <div className="p-5 sm:p-6 md:p-8">
              <div className="mb-6 pb-5 border-b border-petal-rule">
                <h3 className="font-display text-2xl font-light tracking-tight text-petal-ink">
                  確認<em className="not-italic font-light italic text-red-500">刪除</em>
                </h3>
              </div>
              <div className="flex items-center gap-3 mb-6 p-3 bg-white rounded-md border border-petal-rule">
                <span className="text-2xl">{deletingRecord.mood}</span>
                <div>
                  <div className="font-display italic font-light text-sm text-petal-muted">
                    {deletingRecord.date} · {deletingRecord.time}
                  </div>
                  {deletingRecord.description && (
                    <p className="font-body text-sm text-petal-ink mt-0.5 line-clamp-1">{deletingRecord.description}</p>
                  )}
                </div>
              </div>
              <p className="font-body text-sm text-petal-muted mb-8">
                確定要刪除這筆親密記錄嗎？此操作無法復原。
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeletingRecord(null); }}
                  className="flex-1 px-4 py-3 border border-petal-rule text-petal-ink rounded-md hover:bg-petal-cream-2 transition-colors font-body text-sm"
                >
                  取消
                </button>
                <button
                  onClick={() => handleDeleteRecord(deletingRecord)}
                  className="flex-1 px-4 py-3 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors font-display italic text-base"
                >
                  確認刪除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </EngineerModeProvider>
    </TimezoneProvider>
    </FeatureFlagsProvider>
  );
};

export default LoveTimeApp;
