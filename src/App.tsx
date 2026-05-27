import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, Calendar, Trophy, Gamepad2, MessageCircle, Clock, Sparkles, Camera, MapPin, Upload, Play, Coins, Plus, X, User, ShoppingBag, Inbox, Pause, StickyNote, ChevronDown, ChevronUp, Send, Check, MessageSquareHeart } from 'lucide-react';
import SettingsView from './components/SettingsView';
import RoleplayView from './components/RoleplayView';
import WallView from './components/WallView';
import EventsView from './components/EventsView';
import type { WallExample } from './components/WallPostComposer';
import { AchievementsView } from './components/AchievementsView';
import Header from './components/Header';
import { NotificationContainer } from './components/ErrorNotification';
import IntimacyRequestsHistory from './components/IntimacyRequestsHistory';
import IntimacyRequestForm from './components/IntimacyRequestForm';
import NotificationInbox from './components/NotificationInbox';
import PairingInvitationHandler from './components/PairingInvitationHandler';
import { apiService } from './services/api';
import { conflictPhraseTiers } from './data/conflictSteps';

interface IntimateRecord {
  id: number;
  date: string;
  time: string;
  mood: string;
  notes?: string;
  timestamp: string;
  photo?: string;
  description?: string;
  duration?: string;
  location?: string;
  roleplayScript?: string;
  coinsEarned?: number;
  activityType?: string;
}

interface Nicknames {
  partner1: string;
  partner2: string;
}

interface JourneyMilestone {
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

interface Notification {
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

interface RoleplayScript {
  id: string;
  title: string;
  category: 'romantic' | 'adventurous' | 'school' | 'bold';
  scenario: string;
  image?: string;
  script: string;
  isCustom?: boolean;
  createdBy?: string;
  createdAt?: string;
  tags?: string[];
  duration?: string;
}

interface ApiCustomScript {
  id?: string;
  title?: string;
  category?: RoleplayScript['category'];
  scenario?: string;
  script?: string;
  content?: string;
  tags?: string[];
  duration?: string;
  thumbnailUrl?: string;
  isCustom?: boolean;
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

interface CoinGift {
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
  partnerId?: string;
  partnerCode?: string;
  partnerNickname?: string;
  createdAt: string;
}

interface AuthState {
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
// as a demo card when the wall is empty. The first entry is the framework
// the user wrote — a meta-communication template for "how I want to be
// responded to when you approach me and I'm tired."
const defaultWallExamples: WallExample[] = [
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
interface ForeplayActivity {
  title: string;
  description: string;
  duration: string;
  coins: number;
  tips: string[];
}

interface PositionSuggestion {
  name: string;
  difficulty: string;
  description: string;
  coins: number;
  benefits: string[];
}

const LoveTimeApp = () => {
  const [currentView, setCurrentView] = useState('record');
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [intimateRecords, setIntimateRecords] = useState<IntimateRecord[]>([]);
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

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [roleplayFilter, setRoleplayFilter] = useState('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalCoins, setTotalCoins] = useState(0);
  const [customGifts, setCustomGifts] = useState<CoinGift[]>([]);
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    partnerConnected: false
  });
  const { isAuthenticated, user: authUser, partnerConnected } = authState;
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPairingPrompt, setShowPairingPrompt] = useState(false);
  const [pairingPromptDismissed, setPairingPromptDismissed] = useState(
    localStorage.getItem('pairingPromptDismissed') === 'true'
  );
  const [pairingPromptEmail, setPairingPromptEmail] = useState('');
  const [pairingPromptSending, setPairingPromptSending] = useState(false);
  const [pairingPromptSent, setPairingPromptSent] = useState(false);

  const [customScripts, setCustomScripts] = useState<RoleplayScript[]>([]);
  const [favoriteScriptIds, setFavoriteScriptIds] = useState<Set<string>>(new Set());
  const [showScriptUploadModal, setShowScriptUploadModal] = useState(false);
  // When set, the upload modal opens in edit mode pre-filled from this script.
  const [editingScript, setEditingScript] = useState<RoleplayScript | null>(null);
  const [showIntimacyRequestForm, setShowIntimacyRequestForm] = useState(false);
  const [showNotificationInbox, setShowNotificationInbox] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

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

  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image compression utility
  const compressImage = (file: File, maxWidth: number = 800, maxHeight: number = 600, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

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
        created_at?: string;
      };

      const user: User = {
        id: userData.id || Date.now().toString(),
        email: userData.email,
        nickname: userData.nickname,
        gender: userData.gender,
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
        created_at?: string;
      };
      
      const user: User = {
        id: userData.id || Date.now().toString(),
        email: userData.email,
        nickname: userData.nickname,
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
    if (authState.isAuthenticated && !authState.partnerConnected && !pairingPromptDismissed) {
      setShowPairingPrompt(true);
    } else {
      setShowPairingPrompt(false);
    }
  }, [authState.isAuthenticated, authState.partnerConnected, pairingPromptDismissed]);

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

  const handleLogout = async () => {
    try {
      await apiService.logout();
      setAuthState({
        user: null,
        isAuthenticated: false,
        partnerConnected: false
      });
      showNotification({
        type: 'info',
        title: '已登出',
        message: '感謝使用 Twogether'
      });
    } catch (error: unknown) {
      showNotification({
        type: 'error',
        title: '登出失敗',
        message: (error as Error)?.message || '登出過程中發生錯誤'
      });
    }
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

        // Load couple information to get partner details and journey fields
        try {
          const coupleInfo = await apiService.getCouple();

          // Load nicknames using the couple data to avoid duplicate API call
          const storedNicknames = await apiService.getNicknames(coupleInfo);
          setNicknames(storedNicknames);

          if (coupleInfo && authUser) {
            const nextPartnerConnected = !!coupleInfo.user2Nickname;
            const nextPartnerNickname = storedNicknames.partner2 || undefined;

            const needsUpdate =
              authUser.partnerId !== coupleInfo.id ||
              authUser.partnerNickname !== nextPartnerNickname ||
              partnerConnected !== nextPartnerConnected;

            if (needsUpdate) {
              const updatedAuthState: AuthState = {
                isAuthenticated: true,
                partnerConnected: nextPartnerConnected,
                user: {
                  ...authUser,
                  partnerId: coupleInfo.id,
                  partnerNickname: nextPartnerNickname // partner2 is always the partner's nickname
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
            script: script.script || script.content || '',
            tags: script.tags || [],
            duration: script.duration,
            image: script.thumbnailUrl,
            isCustom: script.isCustom ?? true,
            createdBy: script.createdBy,
            createdAt: script.createdAt
          }));
          setCustomScripts(transformedScripts);
        } catch (scriptError) {
          console.error('Failed to load custom scripts:', scriptError);
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
  }, [isAuthenticated, authUser, partnerConnected]); // Re-run when auth user changes

  // Note: Intimate records are now persisted in the backend, no localStorage needed

  // Nicknames are persisted through the explicit Save button in SettingsView,
  // not on every keystroke — see SettingsView.handleSaveSettings.

  // Backend is the source of truth for nicknames, customGifts, customScripts,
  // and totalCoins. They are never cached in localStorage — see /api/* loaders
  // in the authenticated-data effect below.

  // Notification system
  const showNotification = (notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    const newNotification = { ...notification, id };
    setNotifications(prev => [...prev, newNotification]);

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, notification.duration || 5000);
  };

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
            date: intimateRecords[count - 1]?.date || new Date().toISOString().split('T')[0],
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
        photo: photoId ? `/api/photos/${photoId}/file` : undefined,
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
      
      // Show success notification
      const { badgeProgress } = checkBadgeProgress();
      showNotification({
        type: 'success',
        title: '記錄成功！',
        message: badgeProgress,
        coins: coinsEarned,
        duration: 6000
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

  // Script management functions
  const parseScriptContent = (content: string): string => {
    // Clean and format script content
    const lines = content.split('\n').filter(line => line.trim());
    const formattedLines = lines.map(line => {
      // Replace placeholder names with actual nicknames
      line = line.replace(/\[男\]|\[他\]|\[partner1\]/gi, nicknames.partner1);
      line = line.replace(/\[女\]|\[她\]|\[partner2\]/gi, nicknames.partner2);
      
      // Format dialogue
      if (line.includes(':')) {
        const [speaker, dialogue] = line.split(':');
        return `${speaker.trim()}: "${dialogue.trim()}"`;
      }
      
      return line;
    });
    
    return formattedLines.join('\n\n');
  };

  const addCustomScript = async (title: string, category: 'romantic' | 'adventurous' | 'school' | 'bold', scenario: string, content: string, tags: string[] = [], thumbnail?: File) => {
    try {
      // Create script via backend API
      const rawScript = await apiService.createCustomScript({
        title,
        category,
        scenario,
        content: parseScriptContent(content),
        tags,
        duration: '15-30分鐘',
        thumbnail
      });

      // Transform the response to match RoleplayScript interface
      const typedScript = rawScript as ApiCustomScript;
      const newScript: RoleplayScript = {
        id: typedScript.id || '',
        title: typedScript.title || title,
        category: typedScript.category || category,
        scenario: typedScript.scenario || scenario,
        script: typedScript.script || typedScript.content || parseScriptContent(content),
        tags: typedScript.tags || tags,
        duration: typedScript.duration || '15-30分鐘',
        image: typedScript.thumbnailUrl,
        isCustom: true,
        createdBy: typedScript.createdBy,
        createdAt: typedScript.createdAt
      };

      // Update local state
      setCustomScripts(prev => [...prev, newScript]);
      setShowScriptUploadModal(false);

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
      showNotification({
        type: 'error',
        title: '劇本上傳失敗',
        message: '無法保存劇本到服務器，請稍後再試',
        duration: 5000
      });
    }
  };

  // Edit an existing custom script. Accepts an optional new thumbnail; when
  // provided the request goes multipart (api.ts handles the switch) and the
  // backend PUT route uploads it to Supabase storage.
  // NOTE: content is NOT re-run through parseScriptContent here — the form
  // is initialized from script.content (already parsed at creation), and
  // re-parsing would double-format dialogue.
  const updateCustomScript = async (
    id: string,
    updates: {
      title: string;
      category: 'romantic' | 'adventurous' | 'school' | 'bold';
      scenario: string;
      content: string;
      tags: string[];
      thumbnail?: File;
    }
  ) => {
    try {
      const rawScript = await apiService.updateCustomScript(id, {
        title: updates.title,
        category: updates.category,
        scenario: updates.scenario,
        content: updates.content,
        tags: updates.tags,
        thumbnail: updates.thumbnail,
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
                script: typedScript.script || typedScript.content || updates.content,
                tags: typedScript.tags || updates.tags,
                // Server may have updated the thumbnail URL; fall back to
                // the existing image if no new one was uploaded.
                image: typedScript.thumbnailUrl ?? s.image,
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
        message: '無法保存修改，請稍後再試',
        duration: 5000,
      });
    }
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



  const romanticGames = [
    { 
      title: '真心話大冒險', 
      desc: '輪流問對方從未問過的問題，增進了解',
      instructions: [
        '1. 準備紙條寫下問題，放入盒子中',
        '2. 輪流抽取問題，必須誠實回答',
        '3. 問題可以包括：夢想、恐懼、幻想、回憶',
        '4. 大冒險可以是：唱歌、按摩、親吻、擥抱',
        '5. 創造安全舒適的環境，互相尊重'
      ],
      questions: [
        '如果今晚是世界末日，你最想和我做什麼？',
        '你對我身體最著迷的部位是哪裡？',
        '描述你心中最完美的約會夜晚',
        '你最想在哪個地方和我親熱？',
        '如果可以實現一個性幻想，會是什麼？'
      ]
    },
    { 
      title: '感官按摩', 
      desc: '用觸覺喚醒彼此的感官，放鬆身心',
      instructions: [
        '1. 準備香薰蠟燭和按摩油',
        '2. 調暗燈光，播放輕柔音樂',
        '3. 從肩膀開始，慢慢按摩全身',
        '4. 專注於對方的反應和呼吸',
        '5. 輪流為對方按摩，享受被愛撫的感覺'
      ],
      tips: [
        '用溫熱的按摩油，避免太冷',
        '變化按摩的力度和節奏',
        '不要忽略敏感部位',
        '用指尖輕撫，製造酥麻感',
        '按摩時保持眼神交流'
      ]
    },
    { 
      title: '情慾骰子', 
      desc: '用骰子決定親密動作，增加刺激感',
      instructions: [
        '1. 準備兩個骰子（動作骰子和部位骰子）',
        '2. 動作包括：親吻、撫摸、按摩、舔舐、輕咬、吹氣',
        '3. 部位包括：唇、頸、耳、胸、腰、腿',
        '4. 輪流擲骰子，按照結果執行',
        '5. 可以設定時間限制，增加刺激感'
      ],
      variations: [
        '加入溫度元素：冰塊或溫水',
        '使用羽毛或絲巾增加質感',
        '設定不同的強度等級',
        '加入調情話語的要求',
        '結合不同的姿勢或位置'
      ]
    },
    { 
      title: '慢燃調情', 
      desc: '用語言和眼神慢慢點燃激情',
      instructions: [
        '1. 面對面坐著，保持眼神接觸',
        '2. 輪流說出對方最性感的特質',
        '3. 描述你想對對方做的事情',
        '4. 用手輕撫但不要碰觸私密部位',
        '5. 建立期待感，延遲滿足'
      ],
      phrases: [
        '你知道嗎？當你看著我的時候...',
        '我一直在想像...',
        '今晚我想要...',
        '你讓我感到...',
        '如果我們現在...'
      ]
    },
    { 
      title: '記憶重現', 
      desc: '重演你們最難忘的親密時刻',
      instructions: [
        '1. 分享彼此最難忘的親密回憶',
        '2. 選擇一個想要重演的場景',
        '3. 儘可能還原當時的情境',
        '4. 加入新的元素讓體驗更豐富',
        '5. 專注於當時的感覺和情緒'
      ],
      scenarios: [
        '第一次親吻的地點和感覺',
        '最浪漫的一次約會夜晚',
        '最激情的一次親密時光',
        '最意外的親密時刻',
        '最溫柔纏綿的早晨'
      ]
    },
    {
      title: '慾望清單',
      desc: '分享彼此的性幻想和願望',
      instructions: [
        '1. 各自寫下5個親密願望',
        '2. 交換清單，討論每一項',
        '3. 選擇雙方都感興趣的項目',
        '4. 制定實現這些願望的計劃',
        '5. 從最容易實現的開始嘗試'
      ],
      categories: [
        '新的地點或環境',
        '不同的角色扮演',
        '新的親密方式',
        '感官刺激體驗',
        '浪漫情境設定'
      ]
    },
    {
      title: '回憶倒帶',
      desc: 'App 隨機抽一題溫柔回憶，說完後讓另一方做一個「回饋動作」',
      instructions: [
        '1. 一人從下方問題中隨機抽一題',
        '2. 認真回想，誠實分享你的答案',
        '3. 另一方靜靜聽完，選擇一個回饋動作回應',
        '4. 回饋動作：摸頭、擁抱、輕靠肩，或任何溫柔的肢體互動',
        '5. 輪流換邊抽題，慢慢回顧你們的點滴'
      ],
      questions: [
        '第一次覺得對方很可愛是什麼時候？',
        '最近一次被對方感動是因為？',
        '對方做過最讓你心動的小事是什麼？',
        '想到我們最幸福的一天，你會想到哪一天？',
        '對方哪一個習慣讓你忍不住微笑？',
        ...customMemoryQuestions
      ]
    },
    {
      title: '情緒模仿秀',
      desc: '抽到一個情緒，不能說話，只能用身體或眼神表演，對方猜',
      instructions: [
        '1. 一人從下方情緒中隨機抽一個',
        '2. 不能說話，只能用身體動作、表情、眼神演出來',
        '3. 對方在 60 秒內猜出情緒',
        '4. 猜對換邊；猜錯也好玩，互相回饋哪裡演得像、哪裡可以再加強',
        '5. 過程輕鬆，氣氛帶點曖昧'
      ],
      emotions: [
        '害羞',
        '惹人疼',
        '想撒嬌',
        '吃醋',
        '欲拒還迎',
        '故作冷淡',
        ...customEmotions
      ]
    }
  ];

  const conflictResolutions = [
    { title: '傾聽練習', desc: '給對方5分鐘不被打斷的表達時間' },
    { title: '愛的語言', desc: '用"我感覺"而不是"你總是"來表達' },
    { title: '擁抱和解', desc: '爭吵後先給對方一個溫暖的擁抱' },
    { title: '寫信溝通', desc: '將想說的話寫成信，避免激烈爭吵' },
    { title: '約定時間', desc: '設定專門的溝通時間，心平氣和討論' }
  ];

  // Foreplay Activities
  const foreplayActivities = [
    {
      title: '感官按摩',
      description: '用溫熱的按摩油為彼此按摩，喚醒身體的每一寸肌膚',
      duration: '15-30分鐘',
      coins: 150,
      tips: ['使用香薰蠟燭營造氛圍', '從肩膀開始慢慢按摩', '專注於對方的反應']
    },
    {
      title: '冰火兩重天',
      description: '用冰塊和溫水交替刺激敏感部位，帶來不同的感官體驗',
      duration: '10-20分鐘',
      coins: 200,
      tips: ['準備冰塊和溫水', '輕柔地在身體上滑動', '注意對方的感受']
    },
    {
      title: '羽毛撫摸',
      description: '用柔軟的羽毛輕撫身體，帶來酥麻的快感',
      duration: '10-15分鐘',
      coins: 150,
      tips: ['選擇柔軟的羽毛', '從不敏感部位開始', '變化力度和速度']
    },
    {
      title: '蒙眼遊戲',
      description: '蒙上眼睛，讓其他感官更加敏銳，增加神秘感',
      duration: '20-30分鐘',
      coins: 250,
      tips: ['使用絲巾或眼罩', '專注於觸覺和聽覺', '保持溝通']
    }
  ];

  // Position suggestions
  const positionSuggestions = [
    {
      name: '蓮花式',
      difficulty: '簡單',
      description: '面對面坐著，增進親密感和眼神交流',
      coins: 200,
      benefits: ['增進情感連結', '便於親吻和撫摸', '適合慢節奏']
    },
    {
      name: '側臥式',
      difficulty: '簡單',
      description: '側躺進行，適合長時間親密',
      coins: 200,
      benefits: ['減少疲勞', '適合懷孕期', '便於撫摸']
    },
    {
      name: '後入式',
      difficulty: '中等',
      description: '從後方進入，帶來不同的刺激感',
      coins: 300,
      benefits: ['深度刺激', '便於撫摸敏感部位', '角度變化']
    },
    {
      name: '站立式',
      difficulty: '困難',
      description: '站立進行，增加新鮮感和刺激',
      coins: 400,
      benefits: ['新鮮體驗', '不同角度', '增加難度挑戰']
    },
    {
      name: '開瓶器式',
      difficulty: '中等',
      description: '側躺在床或長凳的邊緣，大腿併攏，伴侶從你身後站立進入。',
      coins: 300,
      benefits: ['雙腿併攏使緊緻感更強', '便於伴侶從身後深入', '進階：用屁股配合伴侶的節奏']
    },
    {
      name: '捲餅沾醬式',
      difficulty: '中等',
      description: '右側躺下，伴侶跨坐在你的右腿上，左腿環繞在他身體的左側。',
      coins: 300,
      benefits: ['深度插入的同時保持目光接觸', '結合狗狗式的深度與面對面的親密', '進階：讓伴侶摩擦你的陰蒂']
    },
    {
      name: '女牛仔騎乘位',
      difficulty: '中等',
      description: '跪在伴侶身上，按壓他的胸部，沿著他的大腿上下滑動；他可以抓住你的大腿或臀部抬起插入。',
      coins: 300,
      benefits: ['伴侶分擔體重，緩解雙腿疲勞', '女性主導，更容易達到高潮', '能延遲男性高潮，雙贏體驗']
    },
    {
      name: '獨輪車式',
      difficulty: '困難',
      description: '手腳並用撐地，伴侶從骨盆向下抱住你，腰部放在你的大腿之間。',
      coins: 400,
      benefits: ['插入更深，刺激更強', '同時鍛鍊手臂力量', '挑戰耐力與默契']
    },
    {
      name: '背面騎乘位',
      difficulty: '中等',
      description: '伴侶仰臥，你反向跨坐在他身上，朝向他的腳。',
      coins: 300,
      benefits: ['女性主導節奏與深度', '可以引導伴侶學習你喜歡的節奏', '不同角度的視覺刺激']
    },
    {
      name: '拱門式',
      difficulty: '簡單',
      description: '面對面坐下，雙腿伸直，膝蓋放在對方大腿上，上半身都稍微向後傾斜。',
      coins: 200,
      benefits: ['能看到對方整個身體', '自由控制插入的深度、速度與角度', '進階：身體越後傾，G 點刺激越強']
    },
    {
      name: '彈珠大師式',
      difficulty: '困難',
      description: '用肩膀支撐身體做半橋式，伴侶以跪姿插入。',
      coins: 400,
      benefits: ['對伴侶來說姿勢舒適', '能同時刺激陰蒂並按摩陰阜', '挑戰核心與肩膀力量']
    }
  ];

  // 連續組合技：一次連續換多個姿勢的進階挑戰。完成可獲得額外金幣獎金（高於單獨嘗試各姿勢的總和）。
  const comboSuggestions = [
    {
      name: '溫柔三部曲',
      difficulty: '簡單',
      description: '從親密接觸慢慢加深連結，適合放鬆的夜晚。',
      sequence: ['蓮花式', '側臥式', '後入式'],
      bonusCoins: 900,
    },
    {
      name: '漸進挑戰',
      difficulty: '中等',
      description: '由淺入深、節奏漸強的中階組合，考驗默契。',
      sequence: ['側臥式', '後入式', '站立式'],
      bonusCoins: 1200,
    },
    {
      name: '大膽探索',
      difficulty: '困難',
      description: '高強度組合，挑戰你們的耐力與創意。',
      sequence: ['站立式', '後入式', '蓮花式'],
      bonusCoins: 1500,
    },
  ];


  // Chinese-numeral date formatter for editorial meta lines. e.g. 二〇二五年九月七日
  const toChineseNum = (n: number): string => {
    const cn = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return cn[n];
    if (n < 20) return n === 10 ? '十' : `十${cn[n - 10]}`;
    if (n < 30) return n === 20 ? '二十' : `二十${cn[n - 20]}`;
    return n === 30 ? '三十' : `三十${cn[n - 30]}`;
  };
  const chineseYear = (y: number): string =>
    y.toString().split('').map(c => '〇一二三四五六七八九'[parseInt(c, 10)]).join('');
  const formatChineseDate = (d: Date): string =>
    `${chineseYear(d.getFullYear())}年${toChineseNum(d.getMonth() + 1)}月${toChineseNum(d.getDate())}日`;

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

  const CalendarView = () => {
    // Helper function to get current time in HH:MM format
    const getCurrentTime = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const [recordForm, setRecordForm] = useState({
      date: selectedDate,
      time: getCurrentTime(),
      mood: '💕',
      notes: '',
      description: '',
      duration: '',
      location: '',
      photo: '',
      roleplayScript: ''
    });

    const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const compressedImage = await compressImage(file);
        setRecordForm({...recordForm, photo: compressedImage});
      } catch (err) {
        console.error('Failed to upload photo:', err);
        showNotification({
          type: 'error',
          title: '照片上傳失敗',
          message: '請稍後再試',
          duration: 3000
        });
      }
    };

    const handleSubmitRecord = async () => {
      // Validate required fields
      if (!recordForm.date) {
        showNotification({
          type: 'error',
          title: '驗證錯誤',
          message: '請選擇日期',
          duration: 6000
        });
        return;
      }

      if (!recordForm.time) {
        showNotification({
          type: 'error',
          title: '驗證錯誤',
          message: '請選擇時間',
          duration: 6000
        });
        return;
      }

      await addIntimateRecord(
        recordForm.date,
        recordForm.time,
        recordForm.mood,
        recordForm.notes || undefined, // Convert empty string to undefined
        recordForm.photo,
        recordForm.description || undefined, // Convert empty string to undefined
        recordForm.duration || undefined,
        recordForm.location || undefined,
        recordForm.roleplayScript || undefined
      );
      setShowRecordModal(false);
      setRecordForm({
        date: selectedDate,
        time: getCurrentTime(),
        mood: '💕',
        notes: '',
        description: '',
        duration: '',
        location: '',
        photo: '',
        roleplayScript: ''
      });
    };

    return (
      <div className="space-y-10">
        <div className="border-b border-petal-rule pb-7">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
                — A · 記錄
              </div>
              <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05]">
                記錄<em className="not-italic font-light italic text-pink-600">時光</em>
              </h2>
            </div>
            <div className="text-left md:text-right font-body text-sm text-petal-muted leading-relaxed">
              {togetherSince ? (
                <>
                  <strong className="block text-petal-ink font-display font-semibold text-base tracking-tight mb-0.5">
                    {daysTogether} days together
                  </strong>
                  自{formatChineseDate(togetherSince)}
                </>
              ) : (
                <span className="font-display italic">— 開始你們的旅程 —</span>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex items-center gap-3 md:flex-1">
              <span className="font-body text-xs uppercase tracking-[0.14em] text-petal-muted">日期</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex-1 max-w-xs px-4 py-2.5 border border-petal-rule rounded-md bg-white font-body text-sm text-petal-ink focus:outline-none focus:border-petal-rose-deep transition-colors"
              />
            </div>
            <button
              data-testid="add-record-button"
              onClick={() => {
                setRecordForm({...recordForm, date: selectedDate});
                setShowRecordModal(true);
              }}
              className="px-6 py-2.5 bg-petal-ink text-petal-cream rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
            >
              + 為這一天添一筆
            </button>
          </div>
        </div>

        {/* Enhanced Record Modal */}
        {showRecordModal && (
          <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-petal-cream rounded-md shadow-petal max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-petal-rule">
              <div className="p-8">
                <div className="flex justify-between items-end mb-8 pb-5 border-b border-petal-rule">
                  <div>
                    <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
                      — 新的記錄
                    </div>
                    <h3 data-testid="record-modal-heading" className="font-display text-3xl font-light tracking-tight text-petal-ink">
                      記錄<em className="not-italic font-light italic text-pink-600">親密時光</em>
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowRecordModal(false)}
                    data-testid="record-modal-close-button"
                    className="text-petal-muted hover:text-petal-ink text-2xl font-light transition-colors leading-none"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">日期選擇</label>
                      <div className="space-y-3">
                        <input
                          type="date"
                          value={recordForm.date}
                          onChange={(e) => setRecordForm({...recordForm, date: e.target.value})}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                        />
                        <CalendarDatePicker 
                          selectedDate={recordForm.date}
                          onDateSelect={(date) => setRecordForm({...recordForm, date})}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">時間</label>
                      <input
                        type="time"
                        value={recordForm.time}
                        onChange={(e) => setRecordForm({...recordForm, time: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  {/* Photo Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Camera className="w-4 h-4 inline mr-2" />
                      上傳照片 (可選)
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                      {recordForm.photo ? (
                        <div className="relative">
                          <img 
                            src={recordForm.photo} 
                            alt="記憶照片" 
                            className="max-h-32 mx-auto rounded-lg"
                          />
                          <button
                            onClick={() => setRecordForm({...recordForm, photo: ''})}
                            className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 text-sm"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div>
                          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-pink-600 hover:text-pink-700 font-medium"
                          >
                            點擊上傳照片
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            className="hidden"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Description and Details */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">描述你們做了什麼</label>
                    <textarea
                      value={recordForm.description}
                      onChange={(e) => setRecordForm({...recordForm, description: e.target.value})}
                      placeholder="分享這個美好時光的細節..."
                      data-testid="record-description-input"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 h-20"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Clock className="w-4 h-4 inline mr-2" />
                        持續時間
                      </label>
                      <input
                        type="text"
                        value={recordForm.duration}
                        onChange={(e) => setRecordForm({...recordForm, duration: e.target.value})}
                        placeholder="例如：30分鐘"
                        data-testid="record-duration-input"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <MapPin className="w-4 h-4 inline mr-2" />
                        地點
                      </label>
                      <input
                        type="text"
                        value={recordForm.location}
                        onChange={(e) => setRecordForm({...recordForm, location: e.target.value})}
                        placeholder="例如：臥室、客廳"
                        data-testid="record-location-input"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  {/* Roleplay Script Reference */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Play className="w-4 h-4 inline mr-2" />
                      角色扮演劇本 (可選)
                    </label>
                    <select
                      value={recordForm.roleplayScript}
                      onChange={(e) => setRecordForm({...recordForm, roleplayScript: e.target.value})}
                      data-testid="record-roleplay-select"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                    >
                      <option value="">未使用劇本</option>
                      {/* Default scripts */}
                      {defaultRoleplayScripts.map((script, index) => (
                        <option key={`default-${index}`} value={script.title}>{script.title}</option>
                      ))}
                      {/* Custom scripts */}
                      {customScripts.map((script, index) => (
                        <option key={`custom-${index}`} value={script.title}>{script.title} (自定義)</option>
                      ))}
                    </select>
                  </div>

                  {/* Mood and Notes */}
                  <div>
                    <label className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">心情</label>
                    <div className="flex space-x-2">
                      {['💕', '🔥', '😍', '🥰', '😘', '🌟'].map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => setRecordForm({...recordForm, mood: emoji})}
                          className={`w-11 h-11 text-base rounded-full border transition-all ${
                            recordForm.mood === emoji
                              ? 'border-petal-rose-deep bg-petal-rose-soft/40 opacity-100 saturate-100'
                              : 'border-petal-rule hover:border-petal-rose opacity-60 saturate-75 hover:opacity-90 hover:saturate-100'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">備註</label>
                    <textarea
                      value={recordForm.notes}
                      onChange={(e) => setRecordForm({...recordForm, notes: e.target.value})}
                      placeholder="記錄這個特別時刻的感受..."
                      data-testid="record-notes-input"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 h-20"
                    />
                  </div>
                </div>

                <div className="flex space-x-3 mt-8 pt-6 border-t border-petal-rule">
                  <button
                    onClick={() => setShowRecordModal(false)}
                    data-testid="record-cancel-button"
                    className="flex-1 px-4 py-3 border border-petal-rule text-petal-ink rounded-md hover:bg-petal-cream-2 transition-colors font-body text-sm"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmitRecord}
                    data-testid="record-submit-button"
                    className="flex-1 px-4 py-3 bg-petal-ink text-petal-cream rounded-md hover:bg-pink-700 transition-colors font-display italic text-base"
                  >
                    保存記錄
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink">
              親密<em className="not-italic font-light italic text-pink-600">記錄</em>
            </h3>
            <span className="font-display italic font-light text-sm text-petal-muted">
              共 <b className="not-italic font-normal text-petal-ink">{intimateRecords.length}</b> 次
            </span>
          </div>
          <div className="max-h-[36rem] overflow-y-auto overflow-x-hidden">
            {intimateRecords.slice().reverse().map((record, idx) => (
              <article
                key={record.id}
                onClick={() => showRecordDetails(record.id)}
                className={`grid grid-cols-[40px_1fr] gap-5 py-5 cursor-pointer hover:bg-petal-cream-2/40 -mx-2 px-2 transition-colors ${
                  idx === 0 ? '' : 'border-t border-petal-rule-soft'
                }`}
              >
                <div className="text-base opacity-70 saturate-75 mt-1 text-center leading-none">
                  {record.mood}
                </div>
                <div className="min-w-0">
                  <div className="font-display italic font-light text-sm text-petal-muted mb-1">
                    {record.date} · {record.time}
                  </div>
                  {record.description && (
                    <p className="font-body text-[15px] leading-relaxed text-petal-ink mb-1.5">
                      {record.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-[11px] text-petal-muted mt-1.5">
                    {record.duration && (
                      <span className="inline-flex items-start max-w-full px-2.5 py-0.5 border border-petal-rule rounded-md">
                        <Clock className="w-3 h-3 mr-1 mt-[3px] flex-shrink-0" />
                        <span className="break-words leading-snug">{record.duration}</span>
                      </span>
                    )}
                    {record.location && (
                      <span className="inline-flex items-start max-w-full px-2.5 py-0.5 border border-petal-rule rounded-md">
                        <MapPin className="w-3 h-3 mr-1 mt-[3px] flex-shrink-0" />
                        <span className="break-words leading-snug">{record.location}</span>
                      </span>
                    )}
                    {record.roleplayScript && (
                      <span className="inline-flex items-start max-w-full px-2.5 py-0.5 border border-petal-sage/60 bg-petal-sage/10 text-petal-sage-deep rounded-md">
                        <Play className="w-3 h-3 mr-1 mt-[3px] flex-shrink-0" />
                        <span className="break-words leading-snug">{record.roleplayScript}</span>
                      </span>
                    )}
                  </div>
                  {record.notes && (
                    <p className="font-display italic font-light text-sm text-petal-ink-soft mt-2.5 pl-3 border-l border-petal-rose-soft leading-relaxed">
                      "{record.notes}"
                    </p>
                  )}
                  {record.photo && (
                    <img
                      src={record.photo}
                      alt="記憶照片"
                      className="mt-3 w-24 h-24 rounded-md object-cover border border-petal-rule"
                    />
                  )}
                </div>
              </article>
            ))}
            {intimateRecords.length === 0 && (
              <div className="border border-dashed border-petal-rule rounded-md py-10 px-6 text-center">
                <p className="font-display italic font-light text-base text-petal-muted">
                  還沒有記錄 — 開始你們的愛情之旅吧
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-petal-rule pt-10">
          <AchievementsView />
        </div>
      </div>
    );
  };



  const GamesView = () => (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
              — 情趣
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
              情趣<em className="not-italic font-light italic text-pink-600">遊戲</em>
            </h2>
            <p className="font-display italic font-light text-base text-petal-muted">
              增進彼此感情的遊戲、前戲與姿勢建議 — 一個個慢慢來。
            </p>
          </div>
          <div className="font-display italic font-light text-xl text-petal-ink">
            <Coins className="inline w-4 h-4 mr-1.5 text-petal-rose-deep" strokeWidth={1.5} />
            <b className="not-italic font-medium">{totalCoins}</b> <span className="text-sm text-petal-muted">枚</span>
          </div>
        </div>
      </div>

      <nav className="!mt-0 sticky top-0 z-20 -mx-4 px-4 py-3 bg-petal-cream/95 backdrop-blur-sm border-b border-petal-rule-soft" aria-label="情趣遊戲分區">
        <div className="overflow-x-auto">
          <div className="flex gap-2 whitespace-nowrap">
            {[
              { id: 'games-list', label: '情趣遊戲' },
              { id: 'foreplay-activities', label: '前戲活動' },
              { id: 'position-suggestions', label: '姿勢建議' },
              { id: 'combo-suggestions', label: '連續組合技' },
            ].map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="px-3 py-1.5 border border-petal-rule rounded-full font-body text-xs text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div id="games-list" className="scroll-mt-24">
        <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6">
          情趣<em className="not-italic font-light italic text-pink-600">遊戲</em>
        </h3>
        <div className="space-y-6">
        {romanticGames.map((game, index) => (
          <div key={index} className="bg-white rounded-md border border-petal-rule p-7">
            <div className="flex items-start space-x-4 mb-5 pb-5 border-b border-petal-rule-soft">
              <div className="w-10 h-10 border border-petal-rose-soft bg-petal-rose-soft/40 rounded-full flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-xl font-medium tracking-tight text-petal-ink mb-1">{game.title}</h3>
                <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{game.desc}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-petal-cream-2/50 p-4 rounded-md">
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">遊戲步驟</h4>
                <ul className="space-y-2">
                  {game.instructions.map((instruction, i) => (
                    <li key={i} className="font-body text-sm text-petal-ink-soft leading-relaxed">{instruction}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-petal-cream-2/50 p-4 rounded-md">
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">
                  {game.questions ? '問題範例' :
                   game.tips ? '小貼士' :
                   game.variations ? '變化玩法' :
                   game.phrases ? '調情話語' :
                   game.scenarios ? '場景建議' :
                   game.emotions ? '情緒選項' : '願望類別'}
                </h4>
                <ul className="space-y-2">
                  {(game.questions || game.tips || game.variations || game.phrases || game.scenarios || game.emotions || game.categories || []).map((item, i) => (
                    <li key={i} className="font-body text-sm text-petal-ink-soft leading-relaxed">{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>

      <ForeplayView />
    </div>
  );

  const ConflictView = () => {
    const ArticleDivider = () => (
      <div aria-hidden className="flex justify-center py-2">
        <span className="font-display italic text-petal-muted/60 text-sm tracking-[0.5em]">· · ·</span>
      </div>
    );

    // Pause mode — multi-step flow for couples already in a heated argument.
    // Step 1: emotion selection · Step 2: safety phrase · Step 3: enforced
    // turn-taking with 90s timer · Step 4: closing affirmation.
    type EmotionKey = 'angry' | 'hurt' | 'cold' | 'overwhelmed';
    const EMOTION_OPTIONS: { key: EmotionKey; emoji: string; label: string; sub: string; phrase: string }[] = [
      {
        key: 'angry',
        emoji: '😡',
        label: '生氣',
        sub: '想反擊',
        phrase: '我現在有點激動，我怕我會講出傷人的話，我想先停一下，但我不是不在乎你。',
      },
      {
        key: 'hurt',
        emoji: '😞',
        label: '受傷',
        sub: '想被理解',
        phrase: '我現在其實有點難過，我需要你先聽我講完，不然我會更失落。',
      },
      {
        key: 'cold',
        emoji: '😐',
        label: '冷掉',
        sub: '不想講了',
        phrase: '我現在腦袋有點關機，我需要一點時間消化，但我會回來，不是不在乎。',
      },
      {
        key: 'overwhelmed',
        emoji: '😣',
        label: '快爆了',
        sub: '撐不住了',
        phrase: '我快撐不住了，我需要先暫停喘口氣，這不是不想處理，是先讓自己冷靜。',
      },
    ];

    const TURN_SECONDS = 90;
    const [pauseStep, setPauseStep] = useState<1 | 2 | 3 | 4 | null>(null);
    const [pauseEmotion, setPauseEmotion] = useState<EmotionKey | null>(null);
    const [pauseRound, setPauseRound] = useState<1 | 2>(1);
    const [pauseSeconds, setPauseSeconds] = useState(TURN_SECONDS);
    const [listenerNudge, setListenerNudge] = useState<string | null>(null);

    // Article expand/collapse — keep long-read tucked away by default so the page stays scannable.
    const [articleExpanded, setArticleExpanded] = useState(false);

    // Per-phrase send-to-partner state. Key = `${tier.key}-${phraseIndex}`.
    const [phraseStatus, setPhraseStatus] = useState<Record<string, 'idle' | 'sending' | 'sent'>>({});

    // Toolkit Step 2 accordion — which "need" is currently expanded.
    const [expandedNeed, setExpandedNeed] = useState<string | null>(null);

    // Custom-message composer state — per-step drafts and expanded/collapsed.
    const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
    const [customExpanded, setCustomExpanded] = useState<Record<string, boolean>>({});

    // Toolkit content — 4-step interactive flow for active conflict.
    const emotionFullMessage = '我聽到你了，但我現在情緒有點滿，需要先停一下。我等一下會回來跟你說。';

    const partnerNeedsItems: {
      key: string;
      icon: string;
      title: string;
      body: string;
      suggestions?: string[];
    }[] = [
      {
        key: 'pause-no-explain',
        icon: '①',
        title: '先停下來，不要解釋，不要辯論',
        body: '我現在聽不進理性內容，你越解釋，我越痛。你只要先停下來，我會比較快冷靜。',
      },
      {
        key: 'affirm-feeling',
        icon: '②',
        title: '用一句肯定我情緒的話（一定要有）',
        body: '我不是要你道歉，是要你讓我覺得「你有看見我」。',
        suggestions: [
          '我知道我剛的話讓你不舒服了。',
          '我看得出來你在生氣。',
          '我先陪你一下。',
        ],
      },
      {
        key: 'give-step-down',
        icon: '③',
        title: '給我一個台階：你願意等我',
        body: '有台階，我就會回頭。沒有台階，我只會越走越遠。',
        suggestions: [
          '你先休息一下，我在這裡等你。',
          '等你準備好了，我們再一起聊。',
        ],
      },
    ];

    const exitOptions: { key: string; numeral: string; label: string; message: string }[] = [
      {
        key: 'pause-10min',
        numeral: '1️⃣',
        label: '暫停 10 分鐘',
        message: '我會離開一下下，十分鐘後我們再回到同一個話題。',
      },
      {
        key: 'pause-until-calm',
        numeral: '2️⃣',
        label: '暫停到情緒穩定',
        message: '我現在想先讓情緒平穩，等我冷靜，我會主動來找你。',
      },
      {
        key: 'switch-to-text',
        numeral: '3️⃣',
        label: '用文字聊代替現場聊',
        message: '我現在用說的會越來越激動，我們改用訊息聊，好讓彼此舒服。',
      },
    ];

    const tenderPhrases: string[] = [
      '我沒有要跟你對立，我想靠近你。',
      '你的感受我放在心上。',
      '我在這裡，你慢慢來。',
    ];

    const soothingEmojis: string[] = ['🤝', '🫶', '🌙', '🤍', '🐻', '✨'];

    const caringQuestion = '現在我能怎麼讓你舒服一點？';

    const caringReplyOptions: string[] = [
      '給我 5 分鐘就好。',
      '說一句讓我安心的話。',
      '先抱一下我。',
    ];

    const handleSendPhrase = async (phrase: string, key: string) => {
      if (!partnerConnected) {
        showNotification({
          type: 'warning',
          title: '尚未配對伴侶',
          message: '需要先配對伴侶才能直接傳訊息給對方。',
          duration: 4000,
        });
        return;
      }
      if (phraseStatus[key] === 'sending' || phraseStatus[key] === 'sent') return;
      const confirmed = window.confirm(`確定要把這句話傳給TA嗎？\n\n「${phrase}」`);
      if (!confirmed) return;
      setPhraseStatus(prev => ({ ...prev, [key]: 'sending' }));
      try {
        await apiService.createIntimacyRequest({
          messageContent: phrase,
          requestType: 'reconciliation',
        });
        setPhraseStatus(prev => ({ ...prev, [key]: 'sent' }));
        showNotification({
          type: 'success',
          title: '已送給TA',
          message: '訊息已送到對方的邀請紀錄。',
          duration: 3000,
        });
      } catch (err) {
        setPhraseStatus(prev => ({ ...prev, [key]: 'idle' }));
        showNotification({
          type: 'error',
          title: '送出失敗',
          message: (err as Error)?.message || '請稍後再試。',
          duration: 4000,
        });
      }
    };

    // Custom-message sender — same reconciliation channel, but uses the per-step textarea draft.
    // Resets composer state on success so users can send multiple custom messages in a row.
    const handleSendCustom = async (key: string) => {
      const draft = (customDrafts[key] || '').trim();
      if (!draft) {
        showNotification({
          type: 'warning',
          title: '訊息不能為空',
          message: '請先寫一些字再送出。',
          duration: 3000,
        });
        return;
      }
      if (!partnerConnected) {
        showNotification({
          type: 'warning',
          title: '尚未配對伴侶',
          message: '需要先配對伴侶才能直接傳訊息給對方。',
          duration: 4000,
        });
        return;
      }
      if (phraseStatus[key] === 'sending') return;
      const confirmed = window.confirm(`確定要把這則自訂訊息傳給TA嗎？\n\n「${draft}」`);
      if (!confirmed) return;
      setPhraseStatus(prev => ({ ...prev, [key]: 'sending' }));
      try {
        await apiService.createIntimacyRequest({
          messageContent: draft,
          requestType: 'reconciliation',
        });
        showNotification({
          type: 'success',
          title: '已送給TA',
          message: '自訂訊息已送到對方的邀請紀錄。',
          duration: 3000,
        });
        setPhraseStatus(prev => ({ ...prev, [key]: 'idle' }));
        setCustomDrafts(prev => ({ ...prev, [key]: '' }));
        setCustomExpanded(prev => ({ ...prev, [key]: false }));
      } catch (err) {
        setPhraseStatus(prev => ({ ...prev, [key]: 'idle' }));
        showNotification({
          type: 'error',
          title: '送出失敗',
          message: (err as Error)?.message || '請稍後再試。',
          duration: 4000,
        });
      }
    };

    // Inline custom-message composer — collapsed button by default, expands to textarea + send.
    const renderCustomComposer = (key: string, placeholder = '寫一句自己想說的話傳給TA…') => {
      const draft = customDrafts[key] || '';
      const expanded = !!customExpanded[key];
      const status = phraseStatus[key] || 'idle';
      const isSending = status === 'sending';

      if (!expanded) {
        return (
          <button
            type="button"
            onClick={() => setCustomExpanded(prev => ({ ...prev, [key]: true }))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border border-dashed border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink hover:bg-white/70 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
            寫自己的訊息
          </button>
        );
      }

      const trimmedLen = draft.trim().length;
      const canSend = !isSending && trimmedLen > 0 && partnerConnected;

      return (
        <div className="bg-white/90 rounded-md border border-petal-rule p-3">
          <textarea
            value={draft}
            onChange={(e) => setCustomDrafts(prev => ({ ...prev, [key]: e.target.value }))}
            placeholder={placeholder}
            rows={2}
            maxLength={300}
            disabled={isSending}
            className="w-full font-body text-sm text-petal-ink leading-relaxed bg-transparent border-0 resize-none focus:outline-none placeholder:text-petal-muted/70"
          />
          <div className="flex items-center justify-between gap-2 mt-1.5 pt-2 border-t border-petal-rule-soft">
            <span className="font-body text-[11px] text-petal-muted">
              {draft.length}/300
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCustomExpanded(prev => ({ ...prev, [key]: false }));
                  setCustomDrafts(prev => ({ ...prev, [key]: '' }));
                }}
                disabled={isSending}
                className="px-3 py-1.5 rounded-full font-body text-xs text-petal-muted hover:text-petal-ink transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleSendCustom(key)}
                disabled={!canSend}
                title={!partnerConnected ? '需要先配對伴侶' : ''}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border transition-colors ${
                  isSending
                    ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                    : canSend
                      ? 'border-petal-rose bg-white text-petal-rose-deep hover:bg-petal-rose hover:text-white hover:border-petal-rose'
                      : 'border-petal-rule bg-white text-petal-muted opacity-60 cursor-not-allowed'
                }`}
              >
                {isSending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                    傳送中
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                    傳給TA
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      );
    };

    const scrollToSection = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const sectionNav: { id: string; label: string }[] = [
      { id: 'conflict-pause', label: '正在爭吵中' },
      { id: 'conflict-toolkit', label: '應對工具' },
      { id: 'conflict-article', label: '閱讀' },
      { id: 'conflict-practice', label: '相處練習' },
      { id: 'conflict-phrases', label: '給TA指引' },
    ];

    // Tick timer while on Step 3
    useEffect(() => {
      if (pauseStep !== 3) return;
      const id = setInterval(() => setPauseSeconds(s => Math.max(0, s - 1)), 1000);
      return () => clearInterval(id);
    }, [pauseStep, pauseRound]);

    // When timer hits 0, advance to next round or to Step 4
    useEffect(() => {
      if (pauseStep !== 3 || pauseSeconds > 0) return;
      if (pauseRound === 1) {
        setPauseRound(2);
        setPauseSeconds(TURN_SECONDS);
        setListenerNudge(null);
      } else {
        setPauseStep(4);
      }
    }, [pauseSeconds, pauseStep, pauseRound]);

    const openPause = () => {
      setPauseEmotion(null);
      setPauseRound(1);
      setPauseSeconds(TURN_SECONDS);
      setListenerNudge(null);
      setPauseStep(1);
    };
    const closePause = () => setPauseStep(null);

    const pickEmotion = (key: EmotionKey) => {
      setPauseEmotion(key);
      setPauseStep(2);
    };

    const enterTurnTaking = () => {
      setPauseRound(1);
      setPauseSeconds(TURN_SECONDS);
      setListenerNudge(null);
      setPauseStep(3);
    };

    const skipTurn = () => {
      if (pauseRound === 1) {
        setPauseRound(2);
        setPauseSeconds(TURN_SECONDS);
        setListenerNudge(null);
      } else {
        setPauseStep(4);
      }
    };

    const handleListenerReact = (label: string) => {
      setListenerNudge(label);
      window.setTimeout(() => {
        setListenerNudge(current => (current === label ? null : current));
      }, 2200);
    };

    const formatTime = (s: number) => {
      const m = Math.floor(s / 60).toString().padStart(2, '0');
      const ss = (s % 60).toString().padStart(2, '0');
      return `${m}:${ss}`;
    };

    const selectedPhrase = pauseEmotion ? EMOTION_OPTIONS.find(o => o.key === pauseEmotion) : null;

    return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 和諧
        </div>
        <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
          和諧<em className="not-italic font-light italic text-pink-600">相處</em>
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          化解矛盾，增進理解 — 把急切的話留到明天再說。
        </p>
      </div>

      {/* Sticky section nav — quick jumps within 和諧相處 */}
      <nav
        aria-label="頁面區塊"
        className="sticky top-0 z-30 -mt-6 -mx-4 px-4 py-2.5 bg-petal-cream/95 backdrop-blur-sm border-b border-petal-rule"
      >
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {sectionNav.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToSection(s.id)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full border border-petal-rule bg-white/70 text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink font-body text-xs font-medium tracking-tight transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Emergency Pause — entry card for couples in active conflict */}
      <div id="conflict-pause" className="bg-amber-50 border-2 border-amber-300 rounded-md p-5 md:p-6 scroll-mt-20">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <h3 className="font-display text-lg font-medium tracking-tight text-amber-900 mb-1 flex items-center">
              <Pause className="w-4 h-4 mr-2 fill-amber-700 text-amber-700" strokeWidth={1.5} />
              正在爭吵中？
            </h3>
            <p className="font-body text-sm text-amber-900/80 leading-relaxed">
              進入<b className="not-italic font-medium">冷靜連結模式</b>：4 步引導你們先降溫、再說話，而不是讓溝通變成武器。
            </p>
          </div>
          <button
            type="button"
            onClick={openPause}
            className="px-5 py-3 bg-amber-600 text-white rounded-md text-base font-medium hover:bg-amber-700 transition-colors whitespace-nowrap flex-shrink-0 flex items-center justify-center gap-2"
          >
            <Pause className="w-4 h-4 fill-white" strokeWidth={1.5} />
            暫停一下
          </button>
        </div>
      </div>

      {/* Both-sides conflict toolkit — 4-step interactive guide with sendable messages per step */}
      <section id="conflict-toolkit" className="scroll-mt-20">
        <header className="mb-6">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
            — 衝突進行中的工具箱
          </div>
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-2">
            雙方衝突時的<em className="not-italic font-light italic text-pink-600">應對工具</em>
          </h3>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
            四個小步驟，從「我滿了」走到「我們重新靠近」。每一步都有一鍵就能送到TA那裡的訊息。
            {!partnerConnected && (
              <span className="block mt-1.5 text-petal-muted text-xs">
                配對伴侶後，點任何「傳給TA」按鈕即可直接送出。
              </span>
            )}
          </p>
        </header>

        <div className="space-y-5">
          {/* Step 1 — Notify TA that you're emotionally full */}
          <article className="bg-violet-50/60 border-2 border-violet-200 rounded-md p-5 md:p-7">
            <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800 bg-violet-100/80 px-2.5 py-1 rounded">
                <span aria-hidden>🟣</span>
                Step 1
              </span>
              <h4 className="font-display text-lg md:text-xl font-medium text-petal-ink leading-snug">
                我現在情緒滿了
              </h4>
            </header>
            <p className="font-body text-[13px] text-petal-ink-soft mb-4 leading-relaxed">
              用一句話讓TA知道你需要空間 — 不是生氣、不是不想聽，只是情緒太滿了。
            </p>
            <blockquote className="font-display italic text-[15px] text-petal-ink bg-white/70 rounded-md p-4 border border-white mb-4 leading-relaxed">
              「我現在需要一下下的空間，不是生你的氣，也不是不想聽，只是情緒太滿了。」
            </blockquote>

            <div className="bg-white/80 rounded-md p-4 border border-violet-200/50">
              <div className="font-body text-[11px] uppercase tracking-[0.14em] text-violet-800/80 mb-2">
                📩 一鍵傳送（自動訊息）
              </div>
              <p className="font-display italic text-[14px] text-petal-ink mb-3 leading-relaxed">
                「{emotionFullMessage}」
              </p>
              {(() => {
                const key = 'toolkit-step1-notify';
                const status = phraseStatus[key] || 'idle';
                return (
                  <button
                    type="button"
                    onClick={() => handleSendPhrase(emotionFullMessage, key)}
                    disabled={status === 'sending' || status === 'sent'}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-md font-body text-sm font-medium border transition-colors ${
                      status === 'sent'
                        ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                        : status === 'sending'
                          ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                          : partnerConnected
                            ? 'border-violet-400 bg-violet-600 text-white hover:bg-violet-700 hover:border-violet-700'
                            : 'border-petal-rule bg-white text-petal-muted opacity-60'
                    }`}
                  >
                    {status === 'sent' ? (
                      <>
                        <Check className="w-4 h-4" strokeWidth={2} />
                        已傳送：情緒已滿的通知
                      </>
                    ) : status === 'sending' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                        傳送中…
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" strokeWidth={1.75} />
                        傳送：情緒已滿的通知
                      </>
                    )}
                  </button>
                );
              })()}
            </div>

            <div className="mt-4">
              {renderCustomComposer('toolkit-step1-custom', '想用自己的話告訴TA「我滿了」？寫在這…')}
            </div>
          </article>

          {/* Step 2 — 3 things TA most needs to know (accordion) */}
          <article className="bg-sky-50/60 border-2 border-sky-200 rounded-md p-5 md:p-7">
            <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800 bg-sky-100/80 px-2.5 py-1 rounded">
                <span aria-hidden>🔵</span>
                Step 2
              </span>
              <h4 className="font-display text-lg md:text-xl font-medium text-petal-ink leading-snug">
                給TA看的：3 件我最需要的事情
              </h4>
            </header>
            <p className="font-body text-[13px] text-petal-ink-soft mb-4 leading-relaxed">
              點開每一項，讓TA了解你最需要什麼。展開後的建議話語可以一鍵傳給TA。
            </p>

            <div className="space-y-2">
              {partnerNeedsItems.map((item) => {
                const isExpanded = expandedNeed === item.key;
                return (
                  <div key={item.key} className="bg-white/80 rounded-md border border-sky-200/50 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedNeed(isExpanded ? null : item.key)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-sky-50/40 transition-colors"
                      aria-expanded={isExpanded}
                    >
                      <span className="font-display text-petal-rose-deep text-base flex-shrink-0">{item.icon}</span>
                      <span className="font-display text-[15px] font-medium text-petal-ink flex-1 leading-snug">
                        {item.title}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-petal-muted flex-shrink-0 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        strokeWidth={1.5}
                      />
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-sky-100">
                        <p className="font-body text-[13px] text-petal-ink-soft mb-3 leading-relaxed">
                          {item.body}
                        </p>
                        {item.suggestions && (
                          <>
                            <div className="font-body text-[11px] uppercase tracking-[0.14em] text-sky-800/80 mb-2">
                              建議話語
                            </div>
                            <ul className="space-y-2">
                              {item.suggestions.map((s, i) => {
                                const key = `toolkit-step2-${item.key}-${i}`;
                                const status = phraseStatus[key] || 'idle';
                                return (
                                  <li
                                    key={i}
                                    className="flex flex-col sm:flex-row sm:items-start gap-2 bg-white rounded-md p-3 border border-sky-100"
                                  >
                                    <blockquote className="font-display text-[14px] text-petal-ink leading-relaxed flex-1">
                                      「{s}」
                                    </blockquote>
                                    <button
                                      type="button"
                                      onClick={() => handleSendPhrase(s, key)}
                                      disabled={status === 'sending' || status === 'sent'}
                                      title={partnerConnected ? '傳送這句話給TA' : '需要先配對伴侶'}
                                      className={`flex-shrink-0 self-end sm:self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border transition-colors ${
                                        status === 'sent'
                                          ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                                          : status === 'sending'
                                            ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                                            : partnerConnected
                                              ? 'border-sky-300 bg-white text-sky-800 hover:bg-sky-600 hover:text-white hover:border-sky-600'
                                              : 'border-petal-rule bg-white text-petal-muted opacity-60'
                                      }`}
                                    >
                                      {status === 'sent' ? (
                                        <>
                                          <Check className="w-3.5 h-3.5" strokeWidth={2} />
                                          已送出
                                        </>
                                      ) : status === 'sending' ? (
                                        <>
                                          <span className="w-3.5 h-3.5 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                                          傳送中
                                        </>
                                      ) : (
                                        <>
                                          <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                                          傳給TA
                                        </>
                                      )}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              {renderCustomComposer('toolkit-step2-custom', '想自己跟TA說「我最需要的是…」？寫在這…')}
            </div>
          </article>

          {/* Step 3 — 3 exit options for pausing the conflict */}
          <article className="bg-orange-50/60 border-2 border-orange-200 rounded-md p-5 md:p-7">
            <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-800 bg-orange-100/80 px-2.5 py-1 rounded">
                <span aria-hidden>🟠</span>
                Step 3
              </span>
              <h4 className="font-display text-lg md:text-xl font-medium text-petal-ink leading-snug">
                衝突升起時的退場流程
              </h4>
            </header>
            <p className="font-body text-[13px] text-petal-ink-soft mb-4 leading-relaxed">
              選一種暫停方式，一鍵把對應的暫停訊息送給TA。
            </p>

            <div className="space-y-3">
              {exitOptions.map((opt) => {
                const key = `toolkit-step3-${opt.key}`;
                const status = phraseStatus[key] || 'idle';
                return (
                  <div key={opt.key} className="bg-white/80 rounded-md p-4 border border-orange-200/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base" aria-hidden>{opt.numeral}</span>
                      <span className="font-display text-[15px] font-medium text-petal-ink">
                        {opt.label}
                      </span>
                    </div>
                    <p className="font-display italic text-[14px] text-petal-ink-soft mb-3 leading-relaxed">
                      「{opt.message}」
                    </p>
                    <button
                      type="button"
                      onClick={() => handleSendPhrase(opt.message, key)}
                      disabled={status === 'sending' || status === 'sent'}
                      title={partnerConnected ? '傳送這個暫停訊息給TA' : '需要先配對伴侶'}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md font-body text-sm font-medium border transition-colors ${
                        status === 'sent'
                          ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                          : status === 'sending'
                            ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                            : partnerConnected
                              ? 'border-orange-400 bg-white text-orange-800 hover:bg-orange-600 hover:text-white hover:border-orange-600'
                              : 'border-petal-rule bg-white text-petal-muted opacity-60'
                      }`}
                    >
                      {status === 'sent' ? (
                        <>
                          <Check className="w-4 h-4" strokeWidth={2} />
                          已傳送
                        </>
                      ) : status === 'sending' ? (
                        <>
                          <span className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                          傳送中…
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" strokeWidth={1.75} />
                          選這個 — 傳給TA
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              {renderCustomComposer('toolkit-step3-custom', '想自己寫一個暫停的方式？例如「等我洗完澡再聊」…')}
            </div>
          </article>

          {/* Step 4 — 3 small tasks to bring me back */}
          <article className="bg-amber-50/70 border-2 border-amber-200 rounded-md p-5 md:p-7">
            <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded">
                <span aria-hidden>🟡</span>
                Step 4
              </span>
              <h4 className="font-display text-lg md:text-xl font-medium text-petal-ink leading-snug">
                讓我冷靜後願意回來的關鍵
              </h4>
            </header>
            <p className="font-body text-[13px] text-petal-ink-soft mb-5 leading-relaxed">
              當你準備好靠近TA時 — 或想告訴TA「這樣對我最有效」 — 這三件小事最能拉近距離。
            </p>

            {/* Task 1 — tender phrase */}
            <div className="mb-6">
              <div className="font-body text-[12px] font-semibold tracking-tight text-amber-900 mb-2 flex items-center gap-1.5">
                <span aria-hidden>✔</span>
                任務 1 — 傳一句溫柔語氣
              </div>
              <ul className="space-y-2">
                {tenderPhrases.map((p, i) => {
                  const key = `toolkit-step4-tender-${i}`;
                  const status = phraseStatus[key] || 'idle';
                  return (
                    <li
                      key={i}
                      className="flex flex-col sm:flex-row sm:items-start gap-2 bg-white/80 rounded-md p-3 border border-amber-200/50"
                    >
                      <blockquote className="font-display text-[14px] text-petal-ink leading-relaxed flex-1">
                        「{p}」
                      </blockquote>
                      <button
                        type="button"
                        onClick={() => handleSendPhrase(p, key)}
                        disabled={status === 'sending' || status === 'sent'}
                        title={partnerConnected ? '傳送這句話給TA' : '需要先配對伴侶'}
                        className={`flex-shrink-0 self-end sm:self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border transition-colors ${
                          status === 'sent'
                            ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                            : status === 'sending'
                              ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                              : partnerConnected
                                ? 'border-amber-400 bg-white text-amber-800 hover:bg-amber-600 hover:text-white hover:border-amber-600'
                                : 'border-petal-rule bg-white text-petal-muted opacity-60'
                        }`}
                      >
                        {status === 'sent' ? (
                          <>
                            <Check className="w-3.5 h-3.5" strokeWidth={2} />
                            已送出
                          </>
                        ) : status === 'sending' ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                            傳送中
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                            傳給TA
                          </>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Task 2 — soothing emoji */}
            <div className="mb-6">
              <div className="font-body text-[12px] font-semibold tracking-tight text-amber-900 mb-2 flex items-center gap-1.5">
                <span aria-hidden>✔</span>
                任務 2 — 傳一個安撫 emoji
              </div>
              <p className="font-body text-xs text-petal-ink-soft mb-3 leading-relaxed">
                點一個 emoji 就送出，不用任何文字。
              </p>
              <div className="flex flex-wrap gap-2">
                {soothingEmojis.map((emoji, i) => {
                  const key = `toolkit-step4-emoji-${i}`;
                  const status = phraseStatus[key] || 'idle';
                  const isSent = status === 'sent';
                  const isSending = status === 'sending';
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSendPhrase(emoji, key)}
                      disabled={isSent || isSending}
                      title={
                        isSent ? '已送出' : partnerConnected ? `傳送 ${emoji} 給TA` : '需要先配對伴侶'
                      }
                      className={`w-12 h-12 text-2xl rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSent
                          ? 'border-petal-sage bg-petal-sage/15 cursor-default'
                          : isSending
                            ? 'border-petal-rule bg-white opacity-60 cursor-wait'
                            : partnerConnected
                              ? 'border-amber-300 bg-white hover:bg-amber-100 hover:border-amber-500'
                              : 'border-petal-rule bg-white opacity-60'
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Task 3 — caring question with pre-prepared replies */}
            <div>
              <div className="font-body text-[12px] font-semibold tracking-tight text-amber-900 mb-2 flex items-center gap-1.5">
                <span aria-hidden>✔</span>
                任務 3 — 問一個貼心小問題
              </div>
              <div className="bg-white/80 rounded-md p-4 border border-amber-200/50">
                <blockquote className="font-display italic text-[15px] text-petal-ink mb-3 leading-relaxed">
                  「{caringQuestion}」
                </blockquote>
                {(() => {
                  const key = 'toolkit-step4-question';
                  const status = phraseStatus[key] || 'idle';
                  return (
                    <button
                      type="button"
                      onClick={() => handleSendPhrase(caringQuestion, key)}
                      disabled={status === 'sending' || status === 'sent'}
                      title={partnerConnected ? '把這個問題傳給TA' : '需要先配對伴侶'}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md font-body text-sm font-medium border transition-colors ${
                        status === 'sent'
                          ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                          : status === 'sending'
                            ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                            : partnerConnected
                              ? 'border-amber-400 bg-white text-amber-800 hover:bg-amber-600 hover:text-white hover:border-amber-600'
                              : 'border-petal-rule bg-white text-petal-muted opacity-60'
                      }`}
                    >
                      {status === 'sent' ? (
                        <>
                          <Check className="w-4 h-4" strokeWidth={2} />
                          已傳送
                        </>
                      ) : status === 'sending' ? (
                        <>
                          <span className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                          傳送中…
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" strokeWidth={1.75} />
                          傳這句話給TA
                        </>
                      )}
                    </button>
                  );
                })()}

                <div className="font-body text-[11px] uppercase tracking-[0.14em] text-petal-muted mt-5 mb-2">
                  你可以選的回覆（一鍵送出）
                </div>
                <ul className="space-y-2">
                  {caringReplyOptions.map((r, i) => {
                    const key = `toolkit-step4-reply-${i}`;
                    const status = phraseStatus[key] || 'idle';
                    return (
                      <li
                        key={i}
                        className="flex flex-col sm:flex-row sm:items-start gap-2 bg-white rounded-md p-3 border border-amber-100"
                      >
                        <blockquote className="font-display text-[14px] text-petal-ink leading-relaxed flex-1">
                          「{r}」
                        </blockquote>
                        <button
                          type="button"
                          onClick={() => handleSendPhrase(r, key)}
                          disabled={status === 'sending' || status === 'sent'}
                          title={partnerConnected ? '把這個回覆送給TA' : '需要先配對伴侶'}
                          className={`flex-shrink-0 self-end sm:self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium border transition-colors ${
                            status === 'sent'
                              ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                              : status === 'sending'
                                ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                                : partnerConnected
                                  ? 'border-amber-400 bg-white text-amber-800 hover:bg-amber-600 hover:text-white hover:border-amber-600'
                                  : 'border-petal-rule bg-white text-petal-muted opacity-60'
                          }`}
                        >
                          {status === 'sent' ? (
                            <>
                              <Check className="w-3.5 h-3.5" strokeWidth={2} />
                              已送出
                            </>
                          ) : status === 'sending' ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                              傳送中
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                              傳給TA
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-amber-200/60">
              {renderCustomComposer('toolkit-step4-custom', '想自己寫一句靠近TA的話？寫在這…')}
            </div>
          </article>
        </div>

        <p className="font-display italic text-center text-sm text-petal-muted mt-6 leading-relaxed">
          工具是橋 — 一步步走，回到彼此身邊。
        </p>
      </section>

      {/* Featured Long-Read — 翻譯彼此的語言 (collapsible to keep page scannable) */}
      <article id="conflict-article" className="bg-white rounded-md border border-petal-rule p-6 md:p-10 scroll-mt-20">
        <header className={articleExpanded ? 'mb-7 pb-5 border-b border-petal-rule-soft' : ''}>
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
            — 閱讀
          </div>
          <h3 className="font-display text-3xl font-light tracking-tight text-petal-ink leading-[1.15] mb-3">
            翻譯彼此的<em className="not-italic font-light italic text-pink-600">語言</em>
          </h3>
          <p className="font-display italic font-light text-sm text-petal-muted leading-relaxed">
            在親密關係裡，最常見的衝突往往不是「不愛了」，而是「聽不懂彼此在說什麼」。
          </p>
        </header>

        {!articleExpanded && (
          <div className="mt-5 pt-5 border-t border-petal-rule-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="font-body text-xs text-petal-muted leading-relaxed">
              一則關於先生與太太、靠近與界線的長文 — 約 5 分鐘閱讀。
            </p>
            <button
              type="button"
              onClick={() => setArticleExpanded(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-petal-rule rounded-md font-body text-sm text-petal-rose-deep hover:border-petal-rose-deep hover:bg-petal-cream-2/40 transition-colors self-start sm:self-auto"
            >
              閱讀全文
              <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        )}

        {articleExpanded && (
        <div className="space-y-5 font-body text-[15px] leading-loose text-petal-ink">
          <p>在一段親密關係裡，最常見的衝突，往往不是「不愛了」，而是「聽不懂彼此在說什麼」。</p>
          <p>很多時候，兩個人其實都還在乎對方，只是用完全不同的方式在表達需求。</p>

          <ArticleDivider />

          <p>有一對伴侶，先生和太太，正在經歷這樣的狀況。</p>
          <p>先生其實不是只想要性。他更多時候，是在某些疲憊或空虛的瞬間，想靠近太太，確認彼此還是連結著的。他會想抱一下、想靠近一點、想讓對方知道：「我還在這裡，我想你也還在我身邊。」</p>
          <p>而太太其實也不是不在乎他。只是她常常在忙碌、疲累，或情緒沒有空間的時候，需要安靜與界線。</p>
          <p>問題是，兩個人的「靠近方式」開始產生錯位。</p>

          <ArticleDivider />

          <p>有一次，先生又在晚上試著靠近她。他沒有很強烈地要求什麼，只是用那種想要親近的方式，想拉近距離。</p>
          <p>但太太那天已經很累了。她一開始其實是溫柔的，她說：「我現在有點累。」</p>
          <p>但先生還是想再靠近一點、再確認一點。</p>
          <p>不是故意的，只是他沒有接收到那個「已經不行了」的訊號已經很清楚。</p>

          <ArticleDivider />

          <p>太太開始感覺到一種熟悉的壓力——她明明已經很溫柔了，但好像還是不被停下來。</p>
          <p>於是她的語氣變了。</p>
          <p>從溫柔，變成比較直接。</p>
          <p>甚至有一點冷。</p>
          <p>她心裡想的是：「如果我不講得更清楚，你是不是不會停？」</p>
          <p>但她沒有說出口的是——她並不是不想連結，而是她已經沒有力氣再用更溫柔的方式了。</p>

          <ArticleDivider />

          <p>先生在那一刻感受到的，是另一種痛。</p>
          <p>他不是被「需求」拒絕，而是感覺到自己好像被推開了。</p>
          <p>他心裡會想：「我只是想靠近你，為什麼你變得這麼冷？」</p>
          <p>但他沒有看見的是，太太的強硬，其實不是遠離，而是一種防禦。</p>
          <p>她不是在說「我不愛你」，而是在說：「我需要你現在先停一下，因為我已經沒有空間了。」</p>

          <ArticleDivider />

          <p>這就是兩人之間最常見的誤會。</p>
          <p className="font-display italic text-petal-ink-soft">當溫柔沒有被理解時，會變成更強的界線。</p>
          <p className="font-display italic text-petal-ink-soft">當界線被感覺成拒絕時，會變成更深的失落。</p>
          <p>兩個人都在保護自己，但方式卻讓彼此越來越遠。</p>

          <ArticleDivider />

          <p>後來，他們開始學著翻譯彼此的語言。</p>
          <p>太太慢慢發現，先生很多時候要的不是「做什麼」，而是「還連不連得上」。</p>
          <p>於是她開始嘗試，在無法配合的時候，不只是說「不行」，而是補上一點連結：</p>
          <ul className="space-y-2 pl-5 list-disc marker:text-petal-rose-deep">
            <li>輕輕抱一下</li>
            <li>摸一下手</li>
            <li>說一句：「我現在真的累，但我還在」</li>
            <li>或是給一個明確時間：「等一下／晚點／明天」</li>
          </ul>
          <p>這些小小的動作，對先生來說，比任何解釋都更有安定感。</p>

          <ArticleDivider />

          <p>而先生也開始理解，太太的直接，不是冷漠，而是她的極限已經到了。</p>
          <p>她不是不想溫柔，而是她曾經溫柔過，但那種溫柔沒有被理解，於是她只能換一種更清楚的方式保護自己。</p>

          <ArticleDivider />

          <p>慢慢地，他們才發現一件很重要的事：</p>
          <p className="font-display italic text-lg text-petal-ink leading-relaxed">親密關係的問題，從來不是「要不要答應」，而是「有沒有被理解」。</p>

          <ArticleDivider />

          <div className="space-y-3">
            <p><span className="font-medium text-petal-rose-deep">男生</span>想要的，很多時候不是結果，而是被肯定、被看見、被連結。</p>
            <p><span className="font-medium text-petal-rose-deep">女生</span>需要的，很多時候不是拒絕，而是界線被尊重，同時關係沒有斷掉。</p>
          </div>

          <ArticleDivider />

          <p>當兩個人開始願意翻譯彼此的語言時，關係會開始改變。</p>
          <p>不再是「你要或不要」。</p>
          <p>而變成：</p>

          <blockquote className="my-2 py-4 px-5 border-l-2 border-petal-rose-soft bg-petal-cream-2/40 font-display italic text-base leading-relaxed text-petal-ink space-y-2">
            <p>「我現在不行，但我還在。」</p>
            <p>「我聽見你了，但我們換一種方式靠近。」</p>
          </blockquote>

          <ArticleDivider />

          <p className="font-display italic text-lg leading-relaxed text-petal-ink text-center py-2">
            親密關係真正的成熟，不是永遠一致，而是即使不同步，也不讓彼此失聯。
          </p>

          <div className="pt-5 border-t border-petal-rule-soft flex justify-center">
            <button
              type="button"
              onClick={() => {
                setArticleExpanded(false);
                scrollToSection('conflict-article');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-petal-rule rounded-md font-body text-sm text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
            >
              <ChevronUp className="w-4 h-4" strokeWidth={1.5} />
              收起
            </button>
          </div>
        </div>
        )}
      </article>

      <div id="conflict-practice" className="scroll-mt-20">
        <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6">
          相處<em className="not-italic font-light italic text-pink-600">練習</em>
        </h3>
        <div className="space-y-4">
          {conflictResolutions.map((solution, index) => (
            <div key={index} className="bg-white rounded-md border border-petal-rule p-6">
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 border border-petal-sage/60 bg-petal-sage/10 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-petal-sage-deep" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <h3 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-1.5">{solution.title}</h3>
                  <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{solution.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Partner-facing guide — what TA can do when I'm upset, with sendable phrases per step */}
      <section id="conflict-phrases" className="scroll-mt-20">
        <header className="mb-6">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
            — 給TA的對話指引
          </div>
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-2">
            當我生氣時，你可以<em className="not-italic font-light italic text-pink-600">這樣做</em>
          </h3>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
            八個小步驟，不是要你道歉或認錯 — 而是希望我們在情緒裡也能靠近。你越溫柔，我越能下台階。
            {partnerConnected && (
              <span className="block mt-1.5 text-petal-muted text-xs">
                點每一句後面的「傳給TA」，就能把這句話直接送到對方的邀請紀錄。
              </span>
            )}
          </p>
        </header>

        <div className="space-y-5">
          {conflictPhraseTiers.map((tier) => (
            <article
              key={tier.key}
              className={`rounded-md border-2 ${tier.cardClass} p-5 md:p-7`}
            >
              <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <span
                  className={`inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.16em] ${tier.badgeClass} px-2.5 py-1 rounded`}
                >
                  <span aria-hidden>{tier.dot}</span>
                  {tier.badge}
                </span>
                <h4 className="font-display text-lg md:text-xl font-medium text-petal-ink leading-snug">
                  {tier.title}
                </h4>
              </header>

              <p className="font-body text-[13px] text-petal-ink-soft mb-5 leading-relaxed">
                {tier.why}
              </p>

              <ol className="space-y-3 mb-5">
                {tier.phrases.map((phrase, i) => {
                  const phraseKey = `${tier.key}-${i}`;
                  const status = phraseStatus[phraseKey] || 'idle';
                  return (
                    <li
                      key={i}
                      className="flex flex-col sm:flex-row sm:items-start gap-3 bg-white/70 rounded-md p-3.5 md:p-4 border border-white"
                    >
                      <div className="flex gap-3 flex-1 min-w-0">
                        <span className="font-display italic text-petal-rose-deep text-sm leading-relaxed flex-shrink-0 mt-0.5 w-5">
                          {i + 1}.
                        </span>
                        <blockquote className="font-display text-[15px] md:text-base leading-relaxed text-petal-ink flex-1">
                          「{phrase}」
                        </blockquote>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSendPhrase(phrase, phraseKey)}
                        disabled={status === 'sending' || status === 'sent'}
                        title={partnerConnected ? '直接傳送這句話給TA' : '需要先配對伴侶'}
                        className={`flex-shrink-0 self-end sm:self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium tracking-tight border transition-colors ${
                          status === 'sent'
                            ? 'border-petal-sage bg-petal-sage/15 text-petal-sage-deep cursor-default'
                            : status === 'sending'
                              ? 'border-petal-rule bg-white text-petal-muted cursor-wait'
                              : partnerConnected
                                ? 'border-petal-rose bg-white text-petal-rose-deep hover:bg-petal-rose hover:text-white hover:border-petal-rose'
                                : 'border-petal-rule bg-white text-petal-muted opacity-60'
                        }`}
                      >
                        {status === 'sent' ? (
                          <>
                            <Check className="w-3.5 h-3.5" strokeWidth={2} />
                            已送出
                          </>
                        ) : status === 'sending' ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-petal-muted border-t-transparent rounded-full animate-spin" />
                            傳送中
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                            傳給TA
                          </>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>

              <div className="mb-5">
                {renderCustomComposer(`${tier.key}-custom`, `這一步想自己說一句話？寫給TA…`)}
              </div>

              {tier.note && (
                <p className="font-body text-xs md:text-sm text-petal-ink-soft leading-relaxed border-t border-petal-rule-soft pt-3">
                  {tier.note}
                </p>
              )}
            </article>
          ))}
        </div>

        <p className="font-display italic text-center text-sm text-petal-muted mt-6 leading-relaxed">
          你越溫柔，我越能回來 — 不是輸贏，是回到彼此身邊。
        </p>
      </section>

      {/* Pause Mode — full-screen guided flow */}
      {pauseStep !== null && (
        <div className="fixed inset-0 z-50 bg-petal-cream overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 sm:px-8 py-8 min-h-screen flex flex-col">
            {/* Top bar */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <div className="font-body text-[11px] uppercase tracking-[0.18em] text-amber-700 mb-1">— 暫停模式</div>
                <div className="font-display text-xl text-petal-ink">冷靜連結模式</div>
                <div className="font-body text-xs text-petal-muted mt-0.5">Step {pauseStep} / 4</div>
              </div>
              <button
                type="button"
                onClick={closePause}
                aria-label="關閉"
                className="text-petal-muted hover:text-petal-ink text-3xl leading-none p-2 -m-2"
              >
                ×
              </button>
            </div>

            {/* Step 1 — Emotion selection */}
            {pauseStep === 1 && (
              <div className="flex-1 flex flex-col">
                <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-2">
                  你現在比較像哪一種狀態？
                </h2>
                <p className="font-body text-sm text-petal-ink-soft mb-8">
                  選一個最接近的。這一步不是分析，是讓情緒被命名。
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                  {EMOTION_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => pickEmotion(opt.key)}
                      className="bg-white border-2 border-petal-rule rounded-md p-5 text-left hover:border-amber-400 hover:bg-amber-50/50 transition-colors min-h-[5.5rem]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl leading-none" aria-hidden>{opt.emoji}</span>
                        <div>
                          <div className="font-display text-lg font-medium text-petal-ink">{opt.label}</div>
                          <div className="font-body text-xs text-petal-ink-soft mt-0.5">{opt.sub}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2 — Safety phrase */}
            {pauseStep === 2 && selectedPhrase && (
              <div className="flex-1 flex flex-col">
                <div className="font-body text-xs uppercase tracking-[0.14em] text-petal-muted mb-3">
                  你選的狀態：{selectedPhrase.emoji} {selectedPhrase.label}
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-2">
                  照念這句話給對方聽
                </h2>
                <p className="font-body text-sm text-petal-ink-soft mb-8">
                  不用自己想，直接念。重點是把界線講清楚，又不切斷連結。
                </p>

                <div className="bg-white border-2 border-amber-300 rounded-md p-6 md:p-8 mb-8 flex-1 flex items-center">
                  <p className="font-display text-xl md:text-2xl font-light text-petal-ink leading-relaxed text-center w-full">
                    「{selectedPhrase.phrase}」
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setPauseStep(1)}
                    className="px-5 py-3 border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink rounded-md font-body text-sm transition-colors"
                  >
                    ← 換一個情緒
                  </button>
                  <button
                    type="button"
                    onClick={enterTurnTaking}
                    className="flex-1 px-5 py-3 bg-amber-600 text-white rounded-md text-base font-medium hover:bg-amber-700 transition-colors"
                  >
                    我念完了，開始輪流說 →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 — Enforced turn-taking */}
            {pauseStep === 3 && (
              <div className="flex-1 flex flex-col">
                <div className="font-body text-xs uppercase tracking-[0.14em] text-petal-muted mb-2">
                  第 {pauseRound} 輪 / 共 2 輪
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-1">
                  現在輪到：<span className="text-amber-700">{pauseRound === 1 ? 'A 方' : 'B 方'}</span> 說話
                </h2>
                <p className="font-body text-sm text-petal-ink-soft mb-6">
                  {pauseRound === 1
                    ? 'A 方＝剛剛選擇情緒的那位。另一方只能聽，不能打斷。'
                    : 'B 方＝另一位。同樣只能聽，不能打斷。'}
                </p>

                {/* Timer */}
                <div className="bg-white border-2 border-amber-200 rounded-md p-6 mb-6 text-center">
                  <div className="font-body text-xs uppercase tracking-[0.14em] text-petal-muted mb-2">剩餘時間</div>
                  <div className="font-display text-5xl md:text-6xl font-light text-amber-700 tabular-nums tracking-wide">
                    {formatTime(pauseSeconds)}
                  </div>
                  <div className="w-full h-1.5 bg-amber-100 rounded-full mt-4 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${(pauseSeconds / TURN_SECONDS) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Listener reactions */}
                <div className="flex-1">
                  <p className="font-body text-xs uppercase tracking-[0.14em] text-petal-muted mb-3 text-center">
                    聆聽者只能回應 — 不能打斷
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleListenerReact('我在聽')}
                      className="bg-white border-2 border-petal-rule rounded-md p-4 hover:border-amber-400 hover:bg-amber-50/40 transition-colors text-petal-ink font-body text-base"
                    >
                      <span className="text-2xl mr-2" aria-hidden>👍</span>
                      我在聽
                    </button>
                    <button
                      type="button"
                      onClick={() => handleListenerReact('我理解你在努力說')}
                      className="bg-white border-2 border-petal-rule rounded-md p-4 hover:border-amber-400 hover:bg-amber-50/40 transition-colors text-petal-ink font-body text-base"
                    >
                      <span className="text-2xl mr-2" aria-hidden>💛</span>
                      我理解你在努力說
                    </button>
                  </div>
                  {listenerNudge && (
                    <p className="mt-4 font-display italic text-center text-amber-700 text-sm" role="status">
                      ✓ {listenerNudge}
                    </p>
                  )}
                </div>

                {/* Skip turn */}
                <div className="mt-6 pt-4 border-t border-petal-rule-soft text-center">
                  <button
                    type="button"
                    onClick={skipTurn}
                    className="font-body text-xs text-petal-muted hover:text-petal-ink transition-colors"
                  >
                    {pauseRound === 1 ? '已經講完，換對方 →' : '已經講完，進入收尾 →'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4 — Closing */}
            {pauseStep === 4 && (
              <div className="flex-1 flex flex-col justify-center">
                <h2 className="font-display text-2xl md:text-3xl font-light text-petal-ink leading-snug mb-2 text-center">
                  你們做到了。
                </h2>
                <p className="font-body text-sm text-petal-ink-soft text-center mb-10 leading-relaxed">
                  不一定要現在解決所有事，<br />
                  能夠暫停、聽到彼此，已經是進展。
                </p>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={closePause}
                    className="w-full px-5 py-4 bg-amber-600 text-white rounded-md text-base font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="text-xl" aria-hidden>🤝</span>
                    我理解你現在的感覺
                  </button>
                  <button
                    type="button"
                    onClick={closePause}
                    className="w-full px-5 py-4 bg-white border-2 border-amber-300 text-amber-900 rounded-md text-base font-medium hover:bg-amber-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Pause className="w-4 h-4 fill-amber-700 text-amber-700" strokeWidth={1.5} />
                    我們先暫停 10 分鐘
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    );
  };

  // RoleplayView component moved to separate file

  // Authentication Modal Component
  const AuthModal = () => {
    const [authMode, setAuthMode] = useState<'login' | 'register' | 'partner'>('login');
    const [email, setEmail] = useState('');
    const [nickname, setNickname] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [partnerCode, setPartnerCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      
      if (isLoading) return; // Prevent double-clicking
      
      setIsLoading(true);
      
      const formData = new FormData(e.currentTarget);
      const emailValue = (formData.get('email') as string || '').trim();
      const passwordValue = (formData.get('password') as string || '');
      const nicknameValue = (formData.get('nickname') as string || '').trim();
      const confirmPasswordValue = (formData.get('confirm-password') as string || '');
      const partnerCodeValue = (formData.get('partner-code') as string || '').trim();
      
      try {
        if (authMode === 'login') {
          // Validate login form
          if (!emailValue) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '請輸入電子郵件地址',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          if (!passwordValue) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '請輸入密碼',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          // Basic email validation
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(emailValue)) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '請輸入有效的電子郵件地址',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          // Password length validation
          if (passwordValue.length < 6) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '密碼至少需要6個字符',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          await handleLogin(emailValue, passwordValue);
        } else if (authMode === 'register') {
          // Validate registration form
          if (!emailValue) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '請輸入電子郵件地址',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          if (!nicknameValue) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '請輸入暱稱',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          if (!passwordValue) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '請輸入密碼',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          // Basic email validation
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(emailValue)) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '請輸入有效的電子郵件地址',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          // Nickname length validation
          if (nicknameValue.length < 2 || nicknameValue.length > 50) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '暱稱必須在2-50個字符之間',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          // Password length validation
          if (passwordValue.length < 6) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '密碼至少需要6個字符',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          if (passwordValue !== confirmPasswordValue) {
            showNotification({
              type: 'error',
              title: '密碼不匹配',
              message: '請確認兩次輸入的密碼相同',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          await handleRegister(emailValue, nicknameValue, passwordValue);
        } else {
          // Validate partner code
          if (!partnerCodeValue) {
            showNotification({
              type: 'error',
              title: '驗證錯誤',
              message: '請輸入配對碼',
              duration: 6000
            });
            setIsLoading(false);
            return;
          }
          await handlePartnerConnect(partnerCodeValue);
        }
      } catch (error) {
        // Error handling is done in individual functions
        console.error('Form submission error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-petal-cream rounded-md p-7 max-w-md w-full shadow-petal border border-petal-rule" data-testid="auth-modal">
          <div className="flex justify-between items-end mb-6 pb-5 border-b border-petal-rule">
            <div>
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
                — {authMode === 'login' ? '登入' : authMode === 'register' ? '註冊' : '連接'}
              </div>
              <h3 data-testid="auth-modal-heading" className="font-display text-2xl font-light tracking-tight text-petal-ink">
                {authMode === 'login' ? <>登入<em className="not-italic font-light italic text-pink-600">愛的時光</em></> :
                 authMode === 'register' ? <>註冊<em className="not-italic font-light italic text-pink-600">新帳號</em></> :
                 <>連接<em className="not-italic font-light italic text-pink-600">伴侶</em></>}
              </h3>
            </div>
            <button
              onClick={() => setShowAuthModal(false)}
              data-testid="auth-modal-close-button"
              className="text-petal-muted hover:text-petal-ink transition-colors"
            >
              <X className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>

          {authMode === 'login' && (
            <form key="login-form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-2">
                  電子郵件
                </label>
                <input
                  id="login-email"
                  name="email"
                  data-testid="auth-email-input"
                  type="email"
                  defaultValue={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  placeholder="輸入你的電子郵件"
                  disabled={isLoading}
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-2">
                  密碼
                </label>
                <input
                  id="login-password"
                  name="password"
                  data-testid="auth-password-input"
                  type="password"
                  autoComplete="current-password"
                  defaultValue={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  placeholder="輸入你的密碼"
                  disabled={isLoading}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                data-testid="auth-submit-button"
                className={`w-full py-3 rounded-md font-display italic text-base transition-colors ${
                  isLoading
                    ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                    : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-3">
                    <div className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin"></div>
                    <span>登入中…</span>
                  </div>
                ) : (
                  <span>開始愛的旅程 →</span>
                )}
              </button>
            </form>
          )}

          {authMode === 'register' && (
            <form key="register-form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-2">
                  電子郵件
                </label>
                <input
                  id="register-email"
                  name="email"
                  type="email"
                  defaultValue={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  placeholder="輸入你的電子郵件"
                  disabled={isLoading}
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label htmlFor="register-nickname" className="block text-sm font-medium text-gray-700 mb-2">
                  暱稱
                </label>
                <input
                  id="register-nickname"
                  name="nickname"
                  type="text"
                  defaultValue={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  placeholder="輸入你的暱稱"
                  disabled={isLoading}
                  autoComplete="nickname"
                  required
                />
              </div>
              <div>
                <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-2">
                  密碼
                </label>
                <input
                  id="register-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  defaultValue={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  placeholder="輸入你的密碼"
                  disabled={isLoading}
                  required
                />
              </div>
              <div>
                <label htmlFor="register-confirm-password" className="block text-sm font-medium text-gray-700 mb-2">
                  確認密碼
                </label>
                <input
                  id="register-confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  defaultValue={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  placeholder="再次輸入密碼"
                  disabled={isLoading}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                data-testid="auth-submit-button"
                className={`w-full py-3 rounded-md font-display italic text-base transition-colors ${
                  isLoading
                    ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                    : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-3">
                    <div className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin"></div>
                    <span>註冊中…</span>
                  </div>
                ) : (
                  <span>註冊帳號 →</span>
                )}
              </button>
            </form>
          )}

          {authMode === 'partner' && (
            <form key="partner-form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="partner-code" className="block text-sm font-medium text-gray-700 mb-2">
                  伴侶配對碼
                </label>
                <input
                  id="partner-code"
                  name="partner-code"
                  type="text"
                  defaultValue={partnerCode}
                  onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  placeholder="輸入伴侶的配對碼"
                  disabled={isLoading}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                data-testid="auth-submit-button"
                className={`w-full py-3 rounded-md font-display italic text-base transition-colors ${
                  isLoading
                    ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                    : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-3">
                    <div className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin"></div>
                    <span>連接中…</span>
                  </div>
                ) : (
                  <span>連接伴侶 →</span>
                )}
              </button>
            </form>
          )}

          <div className="mt-4 text-center space-y-2">
            {authMode === 'login' && (
              <>
                <button
                  onClick={() => setAuthMode('register')}
                  disabled={isLoading}
                  className={`text-pink-600 hover:text-pink-700 text-sm block w-full ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  還沒帳號？立即註冊
                </button>
                <button
                  onClick={() => setAuthMode('partner')}
                  disabled={isLoading}
                  className={`text-pink-600 hover:text-pink-700 text-sm block w-full ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  已有帳號？連接伴侶
                </button>
              </>
            )}
            {authMode === 'register' && (
              <button
                onClick={() => setAuthMode('login')}
                disabled={isLoading}
                className={`text-pink-600 hover:text-pink-700 text-sm block w-full ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                已有帳號？立即登入
              </button>
            )}
            {authMode === 'partner' && (
              <button
                onClick={() => setAuthMode('login')}
                disabled={isLoading}
                className={`text-pink-600 hover:text-pink-700 text-sm block w-full ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                還沒帳號？立即註冊
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Coin Shop Component
  const CoinShopView = () => {
    const [showAddGiftModal, setShowAddGiftModal] = useState(false);
    const [newGift, setNewGift] = useState({
      title: '',
      description: '',
      cost: 1000,
      category: 'service' as CoinGift['category'],
      icon: '🎁'
    });

    const allGifts = [...defaultGifts, ...customGifts];

    const handleAddGift = (e: React.FormEvent) => {
      e.preventDefault();
      addCustomGift(newGift.title, newGift.description, newGift.cost, newGift.category, newGift.icon);
      setNewGift({ title: '', description: '', cost: 1000, category: 'service', icon: '🎁' });
    };

    return (
      <div className="space-y-10">
        <div className="border-b border-petal-rule pb-7">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
                — 商店
              </div>
              <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
                金幣<em className="not-italic font-light italic text-pink-600">商店</em>
              </h2>
              <p className="font-display italic font-light text-base text-petal-muted">
                用愛賺來的金幣，兌換特別禮品。
              </p>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2">
              <div className="font-display italic font-light text-2xl text-petal-ink">
                <Coins className="inline w-4 h-4 mr-1.5 text-petal-rose-deep" strokeWidth={1.5} />
                <b className="not-italic font-medium">{totalCoins}</b> <span className="text-base text-petal-muted">枚</span>
              </div>
              <button
                onClick={() => setShowAddGiftModal(true)}
                className="px-4 py-1.5 border border-petal-rule rounded-full text-xs font-body text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>自訂禮品</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {allGifts.map((gift) => (
            <div key={gift.id} className="bg-white rounded-md border border-petal-rule p-6 hover:border-petal-rose transition-colors">
              <div className="mb-4 pb-4 border-b border-petal-rule-soft">
                <div className="text-2xl mb-3 opacity-75 saturate-75">{gift.icon}</div>
                <h3 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-1">{gift.title}</h3>
                <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{gift.description}</p>
              </div>

              <div className="flex items-center justify-between mb-4">
                <span className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted">
                  {gift.category === 'service' ? '服務' :
                   gift.category === 'experience' ? '體驗' :
                   gift.category === 'physical' ? '實物' : '親密'}
                </span>
                <div className="font-display italic font-light text-base text-petal-ink">
                  <Coins className="inline w-3.5 h-3.5 mr-1 text-petal-rose-deep" strokeWidth={1.5} />
                  <b className="not-italic font-normal">{gift.cost}</b>
                </div>
              </div>

              <button
                onClick={() => purchaseGift(gift)}
                disabled={totalCoins < gift.cost}
                className={`w-full py-2.5 rounded-md font-display italic text-base transition-colors ${
                  totalCoins >= gift.cost
                    ? 'bg-petal-ink text-petal-cream hover:bg-pink-700'
                    : 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                }`}
              >
                {totalCoins >= gift.cost ? '立即兌換 →' : '金幣不足'}
              </button>
            </div>
          ))}
        </div>

        {/* Add Custom Gift Modal */}
        {showAddGiftModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-yellow-700">添加自訂禮品</h3>
                <button
                  onClick={() => setShowAddGiftModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAddGift} className="space-y-4">
                <div>
                  <label htmlFor="gift-title" className="block text-sm font-medium text-gray-700 mb-2">
                    禮品名稱
                  </label>
                  <input
                    id="gift-title"
                    name="gift-title"
                    type="text"
                    value={newGift.title}
                    onChange={(e) => setNewGift(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    placeholder="例如：按摩服務"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="gift-description" className="block text-sm font-medium text-gray-700 mb-2">
                    描述
                  </label>
                  <textarea
                    id="gift-description"
                    name="gift-description"
                    value={newGift.description}
                    onChange={(e) => setNewGift(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    placeholder="詳細描述這個禮品"
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="gift-cost" className="block text-sm font-medium text-gray-700 mb-2">
                      金幣價格
                    </label>
                    <input
                      id="gift-cost"
                      name="gift-cost"
                      type="number"
                      value={newGift.cost}
                      onChange={(e) => setNewGift(prev => ({ ...prev, cost: parseInt(e.target.value) }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                      min="100"
                      step="100"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="gift-icon" className="block text-sm font-medium text-gray-700 mb-2">
                      圖示
                    </label>
                    <input
                      id="gift-icon"
                      name="gift-icon"
                      type="text"
                      value={newGift.icon}
                      onChange={(e) => setNewGift(prev => ({ ...prev, icon: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                      placeholder="🎁"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="gift-category" className="block text-sm font-medium text-gray-700 mb-2">
                    類別
                  </label>
                  <select
                    id="gift-category"
                    name="gift-category"
                    value={newGift.category}
                    onChange={(e) => setNewGift(prev => ({ ...prev, category: e.target.value as CoinGift['category'] }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    required
                  >
                    <option value="service">服務</option>
                    <option value="experience">體驗</option>
                    <option value="physical">實物</option>
                    <option value="intimate">親密</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-petal-ink text-petal-cream py-3 rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
                >
                  添加禮品
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Script Upload Modal Component — supports create AND edit. When editingScript
  // is set, the form pre-fills from it and submit dispatches updateCustomScript.
  // Thumbnail editing isn't supported by the backend PUT route, so the file
  // input is hidden in edit mode.
  const ScriptUploadModal = () => {
    const isEditMode = editingScript !== null;
    const [scriptData, setScriptData] = useState(() => ({
      title: editingScript?.title ?? '',
      category: (editingScript?.category ?? 'romantic') as 'romantic' | 'adventurous' | 'school' | 'bold',
      scenario: editingScript?.scenario ?? '',
      content: editingScript?.script ?? '',
      tags: editingScript?.tags ? editingScript.tags.join(', ') : ''
    }));
    const [thumbnail, setThumbnail] = useState<File | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);

    useEffect(() => {
      if (!thumbnail) {
        setThumbnailPreview(null);
        return;
      }
      const url = URL.createObjectURL(thumbnail);
      setThumbnailPreview(url);
      return () => URL.revokeObjectURL(url);
    }, [thumbnail]);

    const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (file && file.size > 5 * 1024 * 1024) {
        alert('縮圖大小不能超過 5MB');
        e.target.value = '';
        return;
      }
      setThumbnail(file);
    };

    const closeAndReset = () => {
      setShowScriptUploadModal(false);
      setEditingScript(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const tags = scriptData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      if (isEditMode && editingScript) {
        updateCustomScript(editingScript.id, {
          title: scriptData.title,
          category: scriptData.category,
          scenario: scriptData.scenario,
          content: scriptData.content,
          tags,
          thumbnail: thumbnail ?? undefined,
        });
      } else {
        addCustomScript(
          scriptData.title,
          scriptData.category,
          scriptData.scenario,
          scriptData.content,
          tags,
          thumbnail ?? undefined,
        );
      }
    };

    return (
      <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-petal-cream rounded-md shadow-petal max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-petal-rule">
          <div className="p-7">
            <div className="flex justify-between items-end mb-6 pb-5 border-b border-petal-rule">
              <div>
                <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
                  — {isEditMode ? '編輯' : '上傳'}
                </div>
                {isEditMode ? (
                  <h3 className="font-display text-2xl font-light tracking-tight text-petal-ink">
                    編輯<em className="not-italic font-light italic text-pink-600">自訂劇本</em>
                  </h3>
                ) : (
                  <h3 className="font-display text-2xl font-light tracking-tight text-petal-ink">
                    上傳自訂劇本
                  </h3>
                )}
              </div>
              <button
                onClick={closeAndReset}
                className="text-petal-muted hover:text-petal-ink transition-colors"
                aria-label="關閉"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>

            <div className="mb-5 p-4 bg-petal-cream-2/50 border border-petal-rule-soft rounded-md">
              <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">劇本格式說明</h4>
              <ul className="font-body text-sm text-petal-ink-soft space-y-1 leading-relaxed">
                <li>• 使用 [男] 或 [partner1] 代表第一個伴侶</li>
                <li>• 使用 [女] 或 [partner2] 代表第二個伴侶</li>
                <li>• 每行對話格式：角色名: 對話內容</li>
                <li>• 系統會自動替換為你們的暱稱</li>
              </ul>
            </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="script-title" className="block text-sm font-medium text-gray-700 mb-2">
                  劇本標題
                </label>
                <input
                  id="script-title"
                  name="script-title"
                  type="text"
                  value={scriptData.title}
                  onChange={(e) => setScriptData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
                  placeholder="例如：浪漫晚餐"
                  required
                />
              </div>

              <div>
                <label htmlFor="script-category" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
                  類別
                </label>
                <select
                  id="script-category"
                  name="script-category"
                  value={scriptData.category}
                  onChange={(e) => setScriptData(prev => ({ ...prev, category: e.target.value as 'romantic' | 'adventurous' | 'school' | 'bold' }))}
                  className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
                  required
                >
                  <option value="romantic">浪漫</option>
                  <option value="adventurous">冒險</option>
                  <option value="school">校園</option>
                  <option value="bold">大膽</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="script-scenario" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
                情境描述
              </label>
              <input
                id="script-scenario"
                name="script-scenario"
                type="text"
                value={scriptData.scenario}
                onChange={(e) => setScriptData(prev => ({ ...prev, scenario: e.target.value }))}
                className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
                placeholder="簡短描述這個劇本的情境"
                required
              />
            </div>

            <div>
              <label htmlFor="script-content" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
                劇本內容
              </label>
              <textarea
                id="script-content"
                name="script-content"
                value={scriptData.content}
                onChange={(e) => setScriptData(prev => ({ ...prev, content: e.target.value }))}
                className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white leading-relaxed"
                placeholder="[男]: 今晚的月色真美&#10;[女]: 是啊，就像你的眼睛一樣..."
                rows={10}
                required
              />
            </div>

            <div>
              <label htmlFor="script-tags" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
                標籤 (用逗號分隔)
              </label>
              <input
                id="script-tags"
                name="script-tags"
                type="text"
                value={scriptData.tags}
                onChange={(e) => setScriptData(prev => ({ ...prev, tags: e.target.value }))}
                className="w-full px-3 py-2.5 border border-petal-rule rounded-md focus:outline-none focus:border-petal-rose-deep font-body text-sm text-petal-ink bg-white"
                placeholder="浪漫, 晚餐, 月光"
              />
            </div>

            <div>
              <label htmlFor="script-thumbnail" className="block font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
                縮圖（選填，最大 5MB）{isEditMode && editingScript?.image ? ' · 上傳新圖以替換' : ''}
              </label>
              <input
                id="script-thumbnail"
                name="script-thumbnail"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleThumbnailChange}
                className="w-full text-sm text-petal-ink-soft file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-body file:text-xs file:bg-petal-cream-2 file:text-petal-ink hover:file:bg-petal-rose-soft hover:file:text-petal-rose-deep"
              />
              {/* Preview: new file beats existing image, else show existing image in edit mode. */}
              {thumbnailPreview ? (
                <img
                  src={thumbnailPreview}
                  alt="thumbnail preview"
                  className="mt-3 w-24 h-24 object-cover rounded-md border border-petal-rule"
                />
              ) : isEditMode && editingScript?.image ? (
                <div className="mt-3 flex items-center gap-3">
                  <img
                    src={editingScript.image}
                    alt="current thumbnail"
                    className="w-24 h-24 object-cover rounded-md border border-petal-rule"
                  />
                  <span className="font-display italic font-light text-xs text-petal-muted">
                    目前的縮圖
                  </span>
                </div>
              ) : null}
              {!isEditMode && (
                <p className="mt-2 font-display italic font-light text-xs text-petal-muted">
                  未上傳縮圖時，會使用編輯式預設圖。
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              {isEditMode && (
                <button
                  type="button"
                  onClick={closeAndReset}
                  className="px-5 py-3 border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink rounded-md font-body text-sm transition-colors"
                >
                  取消
                </button>
              )}
              <button
                type="submit"
                data-testid="script-upload-submit-button"
                className="flex-1 bg-petal-ink text-petal-cream py-3 rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
              >
                {isEditMode ? '保存修改 →' : '上傳劇本 (+200 金幣)'}
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>
    );
  };

  // Foreplay View Component
  const ForeplayView = () => {
    const [selectedActivity, setSelectedActivity] = useState<ForeplayActivity | null>(null);
    const [selectedPosition, setSelectedPosition] = useState<PositionSuggestion | null>(null);

    const handleTryActivity = async (activity: ForeplayActivity) => {
      const coinsEarned = activity.coins;

      // Update coins via backend API
      try {
        await apiService.updateCoins(coinsEarned);
        setTotalCoins(prev => prev + coinsEarned);
      } catch (error) {
        console.warn('Failed to update coins via API, using local update only:', error);
        setTotalCoins(prev => prev + coinsEarned);
      }

      showNotification({
        type: 'success',
        title: `已嘗試 ${activity.title}！`,
        message: '記得稍後記錄你們的親密時光',
        coins: coinsEarned,
        duration: 4000
      });
    };

    const handleTryPosition = async (position: PositionSuggestion) => {
      const coinsEarned = position.coins;

      // Update coins via backend API
      try {
        await apiService.updateCoins(coinsEarned);
        setTotalCoins(prev => prev + coinsEarned);
      } catch (error) {
        console.warn('Failed to update coins via API, using local update only:', error);
        setTotalCoins(prev => prev + coinsEarned);
      }

      showNotification({
        type: 'success',
        title: `已嘗試 ${position.name}！`,
        message: '記得稍後記錄你們的親密時光',
        coins: coinsEarned,
        duration: 4000
      });
    };

    const handleCompleteCombo = async (combo: typeof comboSuggestions[number]) => {
      const coinsEarned = combo.bonusCoins;

      try {
        await apiService.updateCoins(coinsEarned);
        setTotalCoins(prev => prev + coinsEarned);
      } catch (error) {
        console.warn('Failed to update coins via API, using local update only:', error);
        setTotalCoins(prev => prev + coinsEarned);
      }

      showNotification({
        type: 'success',
        title: `組合技達成 — ${combo.name}！`,
        message: `連續完成 ${combo.sequence.length} 種姿勢，記得記錄這次親密時光`,
        coins: coinsEarned,
        duration: 5000,
      });
    };

    return (
      <div className="space-y-10">
        {/* Foreplay Activities */}
        <div id="foreplay-activities" className="scroll-mt-24">
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6">
            前戲<em className="not-italic font-light italic text-pink-600">活動</em>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {foreplayActivities.map((activity, index) => (
              <div key={index} className="border border-petal-rule rounded-md p-5 bg-white hover:border-petal-rose transition-colors">
                <div className="flex justify-between items-start mb-3 pb-3 border-b border-petal-rule-soft">
                  <h4 className="font-display text-lg font-medium tracking-tight text-petal-ink">{activity.title}</h4>
                  <div className="font-display italic font-light text-sm text-petal-rose-deep whitespace-nowrap">
                    <Coins className="inline w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
                    +{activity.coins}
                  </div>
                </div>
                <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-4">{activity.description}</p>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-body text-xs text-petal-muted flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
                    {activity.duration}
                  </span>
                  <button
                    onClick={() => handleTryActivity(activity)}
                    className="px-4 py-1.5 bg-petal-ink text-petal-cream rounded-full hover:bg-pink-700 transition-colors flex items-center space-x-1.5 font-display italic text-sm"
                  >
                    <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>嘗試</span>
                  </button>
                </div>
                <button
                  onClick={() => setSelectedActivity(activity)}
                  className="font-body text-xs text-petal-ink-soft hover:text-petal-rose-deep transition-colors"
                >
                  查看詳細提示 →
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Position Suggestions */}
        <div id="position-suggestions" className="scroll-mt-24">
          <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6">
            姿勢<em className="not-italic font-light italic text-pink-600">建議</em>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {positionSuggestions.map((position, index) => (
              <div key={index} className="border border-petal-rule rounded-md p-5 bg-white hover:border-petal-rose transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-display text-base font-medium tracking-tight text-petal-ink">{position.name}</h4>
                  <div className="font-display italic font-light text-xs text-petal-rose-deep whitespace-nowrap">
                    <Coins className="inline w-3 h-3 mr-0.5" strokeWidth={1.5} />
                    +{position.coins}
                  </div>
                </div>
                <div className="mb-3">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] border ${
                    position.difficulty === '簡單' ? 'border-petal-sage/60 bg-petal-sage/10 text-petal-sage-deep' :
                    position.difficulty === '中等' ? 'border-petal-rose-soft bg-petal-rose-soft/30 text-petal-rose-deep' :
                    'border-petal-ink-soft/30 bg-petal-ink-soft/5 text-petal-ink-soft'
                  }`}>
                    {position.difficulty}
                  </span>
                </div>
                <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-3">{position.description}</p>
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setSelectedPosition(position)}
                    className="font-body text-xs text-petal-ink-soft hover:text-petal-rose-deep transition-colors"
                  >
                    詳細資訊
                  </button>
                  <button
                    onClick={() => handleTryPosition(position)}
                    className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors"
                  >
                    嘗試
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Combo Suggestions — 連續組合技 */}
        <div id="combo-suggestions" className="scroll-mt-24">
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink">
              連續<em className="not-italic font-light italic text-pink-600">組合技</em>
            </h3>
            <span className="font-display italic font-light text-sm text-petal-muted">
              一次連續多種姿勢，額外金幣獎勵
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {comboSuggestions.map((combo, index) => (
              <div key={index} className="border border-petal-rose-soft bg-petal-rose-soft/10 rounded-md p-5 hover:border-petal-rose transition-colors flex flex-col">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-display text-lg font-medium tracking-tight text-petal-ink">{combo.name}</h4>
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] border ${
                    combo.difficulty === '簡單' ? 'border-petal-sage/60 bg-petal-sage/10 text-petal-sage-deep' :
                    combo.difficulty === '中等' ? 'border-petal-rose-soft bg-petal-rose-soft/30 text-petal-rose-deep' :
                    'border-petal-ink-soft/30 bg-petal-ink-soft/5 text-petal-ink-soft'
                  }`}>
                    {combo.difficulty}
                  </span>
                </div>
                <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-4">{combo.description}</p>
                <ol className="space-y-1.5 mb-4">
                  {combo.sequence.map((step, i) => (
                    <li key={i} className="flex items-center font-body text-sm text-petal-ink">
                      <span className="w-5 h-5 rounded-full bg-petal-ink text-petal-cream font-display italic text-[11px] flex items-center justify-center mr-2.5 flex-shrink-0">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
                <div className="mt-auto flex items-center justify-between pt-3 border-t border-petal-rule-soft">
                  <div className="font-display italic font-light text-sm text-petal-rose-deep whitespace-nowrap">
                    <Coins className="inline w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
                    +{combo.bonusCoins} 獎勵
                  </div>
                  <button
                    onClick={() => handleCompleteCombo(combo)}
                    className="px-4 py-1.5 bg-petal-ink text-petal-cream rounded-full hover:bg-pink-700 transition-colors flex items-center space-x-1.5 font-display italic text-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>完成組合技</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Detail Modal */}
        {selectedActivity && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-pink-700">{selectedActivity.title}</h3>
                <button
                  onClick={() => setSelectedActivity(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-gray-600 mb-4">{selectedActivity.description}</p>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-800 mb-2">實用提示：</h4>
                <ul className="space-y-1">
                  {selectedActivity.tips.map((tip: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <span className="text-pink-500 mr-2">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => {
                  handleTryActivity(selectedActivity);
                  setSelectedActivity(null);
                }}
                className="w-full bg-petal-ink text-petal-cream py-3 rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
              >
                開始嘗試
              </button>
            </div>
          </div>
        )}

        {/* Position Detail Modal */}
        {selectedPosition && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-pink-700">{selectedPosition.name}</h3>
                <button
                  onClick={() => setSelectedPosition(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-gray-600 mb-4">{selectedPosition.description}</p>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-800 mb-2">優點：</h4>
                <ul className="space-y-1">
                  {selectedPosition.benefits.map((benefit: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <span className="text-pink-500 mr-2">•</span>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => {
                  handleTryPosition(selectedPosition);
                  setSelectedPosition(null);
                }}
                className="w-full bg-petal-ink text-petal-cream py-3 rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
              >
                嘗試這個姿勢
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleNicknameChange = useCallback((partner: 'partner1' | 'partner2', value: string) => {
    setNicknames(prev => ({...prev, [partner]: value}));
  }, []);

  // SettingsView component moved to separate file

  // Our Journey View
  const OurJourneyView = () => {
    const sortedMilestones = [...journeyMilestones]
      .filter(m => m.date || m.place)
      .sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return da - db;
      });

    const handleMilestoneClick = (milestone: JourneyMilestone) => {
      if (milestone.recordId) {
        // Find and highlight the specific record
        const record = intimateRecords.find(r => r.id === milestone.recordId);
        if (record) {
          setCurrentView('calendar');
          // Could add more specific navigation logic here
        }
      }
    };

    return (
      <div className="space-y-10">
        <div className="border-b border-petal-rule pb-7">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
            — 旅程
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
            我們的<em className="not-italic font-light italic text-pink-600">愛情旅程</em>
          </h2>
          <p className="font-display italic font-light text-base text-petal-muted">
            記錄每個重要的時刻和里程碑。
          </p>
        </div>

        <div>
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-petal-rule"></div>

            <div className="space-y-8">
              {sortedMilestones.map((milestone) => (
                <div key={milestone.id} className="relative flex items-start space-x-6">
                  {/* Timeline Node */}
                  <div className="w-12 h-12 rounded-full bg-petal-cream border border-petal-rose-soft flex items-center justify-center relative z-10 text-base opacity-80 saturate-75">
                    {milestone.type === 'meeting' ? '💕' :
                     milestone.type === 'first_date' ? '🌹' :
                     milestone.type === 'first_kiss' ? '💋' :
                     milestone.type === 'first_sex' ? '💋' :
                     milestone.type === 'marriage' ? '👫' :
                     milestone.type === 'child_born' ? '👶' :
                     '✦'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 bg-white border border-petal-rule rounded-md p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-display text-lg font-medium tracking-tight text-petal-ink">{milestone.title}</h3>
                        <p className="font-display italic font-light text-sm text-petal-muted mt-0.5">
                          {milestone.date ? milestone.date.slice(0, 10) : (milestone.place ? '—' : '')}
                        </p>
                        {milestone.place && (
                          <p className="font-body text-xs text-petal-muted">地點：{milestone.place}</p>
                        )}
                      </div>
                      {milestone.count && (
                        <span className="font-display italic font-light text-xs text-petal-rose-deep border border-petal-rose-soft px-2.5 py-0.5 rounded-full">
                          第 {milestone.count} 次
                        </span>
                      )}
                    </div>
                    <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-3">{milestone.description}</p>

                    {milestone.recordId && (
                      <button
                        onClick={() => handleMilestoneClick(milestone)}
                        className="inline-flex items-center font-body text-xs text-petal-ink-soft hover:text-petal-rose-deep transition-colors"
                      >
                        <Heart className="w-3 h-3 mr-1" strokeWidth={1.5} />
                        查看詳細記錄 →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Future Milestones Preview */}
            <div className="mt-8 p-6 bg-petal-cream-2/40 rounded-md border border-dashed border-petal-rose-soft">
              <h3 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-4 flex items-center">
                <Sparkles className="w-4 h-4 mr-2 text-petal-rose-deep" strokeWidth={1.5} />
                即將到來的里程碑
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { count: 10, achieved: intimateRecords.length >= 10 },
                  { count: 20, achieved: intimateRecords.length >= 20 },
                  { count: 50, achieved: intimateRecords.length >= 50 },
                  { count: 100, achieved: intimateRecords.length >= 100 }
                ].map(({ count, achieved }) => (
                  <div key={count} className={`p-4 rounded-lg border-2 ${
                    achieved 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-gray-200 bg-white'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">第 {count} 次親密時光</span>
                      {achieved ? (
                        <span className="text-green-600 font-bold">✓ 已達成</span>
                      ) : (
                        <span className="text-gray-500">
                          還需 {count - intimateRecords.length} 次
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const navItems = [
    { id: 'record', label: '記錄時光', icon: Calendar },
    { id: 'shop', label: '金幣商店', icon: ShoppingBag },
    { id: 'games', label: '情趣遊戲', icon: Gamepad2 },
    { id: 'conflict', label: '和諧相處', icon: MessageCircle },
    { id: 'events', label: '事件', icon: MessageSquareHeart },
    { id: 'roleplay', label: '角色扮演', icon: Play },
    { id: 'wall', label: '我們的牆', icon: StickyNote },
    { id: 'journey', label: '愛情旅程', icon: Trophy },
    { id: 'intimacy-history', label: '邀請紀錄', icon: Inbox },
    { id: 'settings', label: '設定', icon: Heart }
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
        default: return (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center max-w-md">
              <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-4">
                — 歡迎
              </div>
              <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-4">
                歡迎使用 <em className="not-italic font-light italic text-pink-600">Twogether</em>
              </h2>
              <p className="font-display italic font-light text-base text-petal-muted mb-8">
                登入以開始記錄你們的愛情時光。
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="bg-petal-ink text-petal-cream px-8 py-3 rounded-md hover:bg-pink-700 transition-colors font-display italic text-lg"
                data-testid="login-button"
              >
                立即登入 →
              </button>
            </div>
          </div>
        );
      }
    }

    // Show authenticated content
    switch (currentView) {
      case 'record':
      case 'achievements':
        return <CalendarView />;
      case 'shop': return <CoinShopView />;
      case 'foreplay':
      case 'games':
        return <GamesView />;
      case 'conflict': return <ConflictView />;
      case 'events': return (
        <EventsView
          authState={authState}
          showNotification={showNotification}
          initialEventId={pendingEventId}
          onInitialEventConsumed={() => setPendingEventId(null)}
        />
      );
      case 'roleplay': return <RoleplayView
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
      />;
      case 'journey': return <OurJourneyView />;
      case 'wall': return <WallView
        authState={authState}
        nicknames={nicknames}
        defaultWallExamples={defaultWallExamples}
        moodTags={WALL_MOOD_TAGS}
        showNotification={showNotification}
      />;
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
      case 'intimacy-history': return (
        <IntimacyRequestsHistory
          authState={authState}
          partnerNickname={nicknames.partner2}
        />
      );
      default: return <GamesView />;
    }
  };

  const closeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Calendar component for date picking
  const CalendarDatePicker = ({ selectedDate, onDateSelect }: { selectedDate: string, onDateSelect: (date: string) => void }) => {
    const [currentMonth, setCurrentMonth] = useState(() => {
      const date = selectedDate ? new Date(selectedDate) : new Date();
      return new Date(date.getFullYear(), date.getMonth(), 1);
    });

    const getDaysInMonth = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startingDayOfWeek = firstDay.getDay();

      const days = [];
      
      // Previous month's trailing days
      for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const day = new Date(year, month, -i);
        days.push({ date: day, isCurrentMonth: false });
      }
      
      // Current month's days
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        days.push({ date, isCurrentMonth: true });
      }
      
      // Next month's leading days
      const remainingDays = 42 - days.length; // 6 rows × 7 days
      for (let day = 1; day <= remainingDays; day++) {
        const date = new Date(year, month + 1, day);
        days.push({ date, isCurrentMonth: false });
      }
      
      return days;
    };

    const formatDate = (date: Date) => {
      return date.toISOString().split('T')[0];
    };

    const isSelected = (date: Date) => {
      return formatDate(date) === selectedDate;
    };

    const isToday = (date: Date) => {
      const today = new Date();
      return date.toDateString() === today.toDateString();
    };

    const days = getDaysInMonth(currentMonth);
    const monthYear = currentMonth.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });

    return (
      <div className="bg-white rounded-md p-5 border border-petal-rule">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="w-8 h-8 border border-petal-rule rounded-full text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
          >
            ‹
          </button>
          <h3 className="font-display italic font-light text-lg text-petal-ink">{monthYear}</h3>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="w-8 h-8 border border-petal-rule rounded-full text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['日', '一', '二', '三', '四', '五', '六'].map(day => (
            <div key={day} className="p-2 text-center font-body text-[10px] font-medium uppercase tracking-[0.14em] text-petal-muted">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {days.map((dayInfo, index) => {
            const { date, isCurrentMonth } = dayInfo;
            const selected = isSelected(date);
            const today = isToday(date);

            return (
              <button
                key={index}
                onClick={() => onDateSelect(formatDate(date))}
                className={`
                  p-2 font-display text-sm rounded-full hover:bg-petal-cream-2 transition-colors
                  ${isCurrentMonth ? 'text-petal-ink' : 'text-petal-rule'}
                  ${selected ? 'bg-petal-rose-deep text-petal-cream hover:bg-petal-rose-deep italic' : ''}
                  ${today && !selected ? 'border border-petal-rose-deep text-petal-rose-deep' : ''}
                `}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-petal-cream">
      {/* Header */}
      <Header
        authState={authState}
        totalCoins={totalCoins}
        onShowAuthModal={() => setShowAuthModal(true)}
        onLogout={handleLogout}
        onShowIntimacyRequest={() => setShowIntimacyRequestForm(true)}
        onShowNotifications={() => setShowNotificationInbox(true)}
      />
      
      {/* Notification Container */}
      <NotificationContainer
        notifications={notifications}
        onClose={closeNotification}
      />

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
              <div className="text-center py-4">
                <p className="font-display italic text-petal-sage-deep mb-1">邀請已寄出</p>
                <p className="font-body text-sm text-petal-muted mb-4">請通知伴侶查看信箱 — 連結 7 天內有效。</p>
                <button
                  onClick={() => {
                    setShowPairingPrompt(false);
                    setPairingPromptSent(false);
                    setPairingPromptEmail('');
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
                            await apiService.sendPairingInvitation({ recipientEmail: pairingPromptEmail.trim() });
                            setPairingPromptSent(true);
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
                      await apiService.sendPairingInvitation({ recipientEmail: pairingPromptEmail.trim() });
                      setPairingPromptSent(true);
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
        <div className="text-center mb-10">
          <p className="font-display italic font-light text-base text-petal-muted">
            為熱戀中的你們 — <span className="text-petal-ink">記錄每一段親密時光</span>
          </p>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap justify-center gap-1.5 mb-10">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
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

        {/* Main Content */}
        <div className="max-w-6xl mx-auto">
          {renderView()}
        </div>
      </div>
      
      {/* Modals */}
      {showAuthModal && <AuthModal />}
      {showScriptUploadModal && <ScriptUploadModal />}
      
      {/* Intimacy Request Form */}
      <IntimacyRequestForm
        isOpen={showIntimacyRequestForm}
        onClose={() => setShowIntimacyRequestForm(false)}
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
          setCurrentView(view);
        }}
      />

      {/* Record Detail Modal */}
      {showRecordDetail && selectedRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-800">親密時光詳情</h3>
                <button
                  onClick={() => setShowRecordDetail(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
                {/* Basic Info */}
                <div className="flex items-center space-x-4">
                  <div className="text-4xl">{selectedRecord.mood}</div>
                  <div>
                    <div className="text-xl font-medium text-gray-800">
                      {selectedRecord.date} {selectedRecord.time}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(selectedRecord.timestamp).toLocaleString('zh-TW')}
                    </div>
                  </div>
                </div>

                {/* Photo */}
                {selectedRecord.photo && (
                  <div className="text-center">
                    <img 
                      src={selectedRecord.photo} 
                      alt="記憶照片" 
                      className="max-w-full max-h-96 rounded-lg mx-auto shadow-lg"
                    />
                  </div>
                )}

                {/* Description */}
                {selectedRecord.description && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">描述</h4>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">
                      {selectedRecord.description}
                    </p>
                  </div>
                )}

                {/* Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedRecord.duration && (
                    <div className="flex items-center space-x-2">
                      <Clock className="w-5 h-5 text-pink-500" />
                      <span className="text-gray-700">持續時間: {selectedRecord.duration}</span>
                    </div>
                  )}
                  {selectedRecord.location && (
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-5 h-5 text-pink-500" />
                      <span className="text-gray-700">地點: {selectedRecord.location}</span>
                    </div>
                  )}
                  {selectedRecord.roleplayScript && (
                    <div className="flex items-center space-x-2">
                      <Play className="w-5 h-5 text-purple-500" />
                      <span className="text-gray-700">劇本: {selectedRecord.roleplayScript}</span>
                    </div>
                  )}
                  {selectedRecord.coinsEarned && (
                    <div className="flex items-center space-x-2">
                      <Coins className="w-5 h-5 text-yellow-500" />
                      <span className="text-gray-700">獲得金幣: {selectedRecord.coinsEarned}</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {selectedRecord.notes && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">備註</h4>
                    <p className="text-gray-700 bg-pink-50 p-3 rounded-lg italic">
                      "{selectedRecord.notes}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoveTimeApp;
