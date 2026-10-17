import { useState } from 'react';
import { Coins, Clock, Play, Sparkles, X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { Spinner } from './ui/Spinner';
import { apiService } from '../services/api';
import type { ForeplayActivity, PositionSuggestion, Notification } from '../App';
import { tr } from '../i18n/tr';

// A UUID per coin-earn intent, sent as the idempotency key so a retried or
// duplicated grant is deduped server-side. Falls back to a random string where
// crypto.randomUUID is unavailable (older/insecure contexts, jsdom in tests).
const newIdemKey = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Foreplay Activities
const foreplayActivities: ForeplayActivity[] = [
  {
    title: tr('感官按摩', 'Sensual massage'),
    description: tr('用溫熱的按摩油為彼此按摩，喚醒身體的每一寸肌膚', 'Massage each other with warm oil and awaken every inch of skin'),
    duration: tr('15-30分鐘', '15–30 min'),
    coins: 150,
    tips: [tr('使用香薰蠟燭營造氛圍', 'Set the mood with a scented candle'), tr('從肩膀開始慢慢按摩', 'Start slowly at the shoulders'), tr('專注於對方的反應', 'Focus on how your partner responds')]
  },
  {
    title: tr('冰火兩重天', 'Hot and cold'),
    description: tr('用冰塊和溫水交替刺激敏感部位，帶來不同的感官體驗', 'Alternate ice and warm water on sensitive areas for a different sensory experience'),
    duration: tr('10-20分鐘', '10–20 min'),
    coins: 200,
    tips: [tr('準備冰塊和溫水', 'Prepare ice and warm water'), tr('輕柔地在身體上滑動', 'Glide gently over the body'), tr('注意對方的感受', 'Pay attention to how your partner feels')]
  },
  {
    title: tr('羽毛撫摸', 'Feather touch'),
    description: tr('用柔軟的羽毛輕撫身體，帶來酥麻的快感', 'Brush the body with a soft feather for a tingling thrill'),
    duration: tr('10-15分鐘', '10–15 min'),
    coins: 150,
    tips: [tr('選擇柔軟的羽毛', 'Choose a soft feather'), tr('從不敏感部位開始', 'Start with less sensitive areas'), tr('變化力度和速度', 'Vary the pressure and speed')]
  },
  {
    title: tr('蒙眼遊戲', 'Blindfold game'),
    description: tr('蒙上眼睛，讓其他感官更加敏銳，增加神秘感', 'Cover the eyes to heighten the other senses and add mystery'),
    duration: tr('20-30分鐘', '20–30 min'),
    coins: 250,
    tips: [tr('使用絲巾或眼罩', 'Use a silk scarf or eye mask'), tr('專注於觸覺和聽覺', 'Focus on touch and sound'), tr('保持溝通', 'Keep talking to each other')]
  }
];

// Position suggestions
const positionSuggestions: PositionSuggestion[] = [
  {
    name: tr('蓮花式', 'Lotus'),
    difficulty: tr('簡單', 'Easy'),
    description: tr('面對面坐著，增進親密感和眼神交流', 'Sit face to face for closeness and eye contact'),
    coins: 200,
    benefits: [tr('增進情感連結', 'Deepens emotional connection'), tr('便於親吻和撫摸', 'Easy to kiss and caress'), tr('適合慢節奏', 'Good for a slow pace')]
  },
  {
    name: tr('側臥式', 'Spooning'),
    difficulty: tr('簡單', 'Easy'),
    description: tr('側躺進行，適合長時間親密', 'Lie on your sides; good for long, intimate sessions'),
    coins: 200,
    benefits: [tr('減少疲勞', 'Less tiring'), tr('適合懷孕期', 'Suitable during pregnancy'), tr('便於撫摸', 'Easy to caress')]
  },
  {
    name: tr('後入式', 'From behind'),
    difficulty: tr('中等', 'Medium'),
    description: tr('從後方進入，帶來不同的刺激感', 'Entering from behind for a different sensation'),
    coins: 300,
    benefits: [tr('深度刺激', 'Deeper stimulation'), tr('便於撫摸敏感部位', 'Easy to reach sensitive areas'), tr('角度變化', 'Varied angles')]
  },
  {
    name: tr('站立式', 'Standing'),
    difficulty: tr('困難', 'Hard'),
    description: tr('站立進行，增加新鮮感和刺激', 'Standing up for novelty and excitement'),
    coins: 400,
    benefits: [tr('新鮮體驗', 'A new experience'), tr('不同角度', 'Different angles'), tr('增加難度挑戰', 'Adds a challenge')]
  },
  {
    name: tr('開瓶器式', 'Corkscrew'),
    difficulty: tr('中等', 'Medium'),
    description: tr('側躺在床或長凳的邊緣，大腿併攏，伴侶從你身後站立進入。', 'Lie on your side at the edge of the bed or a bench with thighs together; your partner stands and enters from behind.'),
    coins: 300,
    benefits: [tr('雙腿併攏使緊緻感更強', 'Legs together create a tighter feel'), tr('便於伴侶從身後深入', 'Lets your partner go deeper from behind'), tr('進階：用屁股配合伴侶的節奏', 'Advanced: move your hips with your partner\'s rhythm')]
  },
  {
    name: tr('捲餅沾醬式', 'Burrito'),
    difficulty: tr('中等', 'Medium'),
    description: tr('右側躺下，伴侶跨坐在你的右腿上，左腿環繞在他身體的左側。', 'Lie on your right side; your partner straddles your right leg, with your left leg wrapped around the left side of their body.'),
    coins: 300,
    benefits: [tr('深度插入的同時保持目光接觸', 'Deep penetration while keeping eye contact'), tr('結合狗狗式的深度與面對面的親密', 'Combines the depth of doggy style with face-to-face intimacy'), tr('進階：讓伴侶摩擦你的陰蒂', 'Advanced: have your partner stimulate your clitoris')]
  },
  {
    name: tr('女牛仔騎乘位', 'Cowgirl'),
    difficulty: tr('中等', 'Medium'),
    description: tr('跪在伴侶身上，按壓他的胸部，沿著他的大腿上下滑動；他可以抓住你的大腿或臀部抬起插入。', 'Kneel over your partner, pressing on their chest and sliding along their thighs; they can hold your thighs or hips and lift into you.'),
    coins: 300,
    benefits: [tr('伴侶分擔體重，緩解雙腿疲勞', 'Your partner shares the weight, easing tired legs'), tr('女性主導，更容易達到高潮', 'The woman leads, making orgasm easier'), tr('能延遲男性高潮，雙贏體驗', 'Can delay the man\'s orgasm, a win for both')]
  },
  {
    name: tr('獨輪車式', 'Wheelbarrow'),
    difficulty: tr('困難', 'Hard'),
    description: tr('手腳並用撐地，伴侶從骨盆向下抱住你，腰部放在你的大腿之間。', 'Support yourself on hands and feet; your partner holds you from the pelvis down, with their waist between your thighs.'),
    coins: 400,
    benefits: [tr('插入更深，刺激更強', 'Deeper penetration, stronger stimulation'), tr('同時鍛鍊手臂力量', 'Works your arm strength too'), tr('挑戰耐力與默契', 'Tests stamina and teamwork')]
  },
  {
    name: tr('背面騎乘位', 'Reverse cowgirl'),
    difficulty: tr('中等', 'Medium'),
    description: tr('伴侶仰臥，你反向跨坐在他身上，朝向他的腳。', 'Your partner lies on their back; you straddle them facing their feet.'),
    coins: 300,
    benefits: [tr('女性主導節奏與深度', 'The woman sets the rhythm and depth'), tr('可以引導伴侶學習你喜歡的節奏', 'Lets you show your partner the rhythm you like'), tr('不同角度的視覺刺激', 'Visual stimulation from a different angle')]
  },
  {
    name: tr('拱門式', 'Arch'),
    difficulty: tr('簡單', 'Easy'),
    description: tr('面對面坐下，雙腿伸直，膝蓋放在對方大腿上，上半身都稍微向後傾斜。', 'Sit face to face with legs stretched out, knees resting on each other\'s thighs, both leaning back slightly.'),
    coins: 200,
    benefits: [tr('能看到對方整個身體', 'You can see each other\'s whole body'), tr('自由控制插入的深度、速度與角度', 'Freely control depth, speed and angle'), tr('進階：身體越後傾，G 點刺激越強', 'Advanced: the further back you lean, the stronger the G-spot stimulation')]
  },
  {
    name: tr('彈珠大師式', 'Pinball wizard'),
    difficulty: tr('困難', 'Hard'),
    description: tr('用肩膀支撐身體做半橋式，伴侶以跪姿插入。', 'Support yourself on your shoulders in a half bridge; your partner enters while kneeling.'),
    coins: 400,
    benefits: [tr('對伴侶來說姿勢舒適', 'Comfortable for your partner'), tr('能同時刺激陰蒂並按摩陰阜', 'Stimulates the clitoris and massages the mons at the same time'), tr('挑戰核心與肩膀力量', 'Challenges core and shoulder strength')]
  }
];

// 連續組合技：一次連續換多個姿勢的進階挑戰。完成可獲得額外金幣獎金（高於單獨嘗試各姿勢的總和）。
const comboSuggestions = [
  {
    name: tr('溫柔三部曲', 'Gentle trilogy'),
    difficulty: tr('簡單', 'Easy'),
    description: tr('從親密接觸慢慢加深連結，適合放鬆的夜晚。', 'Deepen your connection slowly from close contact. Perfect for a relaxed night.'),
    sequence: [tr('蓮花式', 'Lotus'), tr('側臥式', 'Spooning'), tr('後入式', 'From behind')],
    bonusCoins: 900,
  },
  {
    name: tr('漸進挑戰', 'Progressive challenge'),
    difficulty: tr('中等', 'Medium'),
    description: tr('由淺入深、節奏漸強的中階組合，考驗默契。', 'An intermediate combo that builds in depth and rhythm, testing your teamwork.'),
    sequence: [tr('側臥式', 'Spooning'), tr('後入式', 'From behind'), tr('站立式', 'Standing')],
    bonusCoins: 1200,
  },
  {
    name: tr('大膽探索', 'Bold exploration'),
    difficulty: tr('困難', 'Hard'),
    description: tr('高強度組合，挑戰你們的耐力與創意。', 'A high-intensity combo that challenges your stamina and creativity.'),
    sequence: [tr('站立式', 'Standing'), tr('後入式', 'From behind'), tr('蓮花式', 'Lotus')],
    bonusCoins: 1500,
  },
];

interface ForeplayViewProps {
  setTotalCoins: React.Dispatch<React.SetStateAction<number>>;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

// Foreplay View Component. Defined at module scope (not inside App) so its
// identity is stable across App re-renders — a nested definition would remount
// on every render and reset the selected activity/position detail modal. See
// issue #41.
const ForeplayView = ({ setTotalCoins, showNotification }: ForeplayViewProps) => {
  const [selectedActivity, setSelectedActivity] = useState<ForeplayActivity | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<PositionSuggestion | null>(null);
  useScrollLock(!!selectedActivity);
  useScrollLock(!!selectedPosition);

  // `earningKey` marks which card is mid-persist (spinner/disable). The hook's
  // ref lock still drops a synchronous double-click; the coin endpoint's
  // idempotency key (migration 085) covers any duplicate that slips past it.
  const [earningKey, setEarningKey] = useState<string | null>(null);
  const { run: earnCoins } = useAsyncAction(async (key: string, fn: () => Promise<void>) => {
    setEarningKey(key);
    try {
      await fn();
    } finally {
      setEarningKey(null);
    }
  });

  // Credit + notify instantly (playbook §R7), then persist in the background.
  // Safe to be optimistic now that /coins/transaction is idempotent: the key
  // makes a retried/duplicated grant a no-op server-side, so a slow network or
  // a timeout that actually succeeded can't double-credit. The local credit is
  // kept even if the sync fails — a network blip shouldn't swallow an earned
  // coin. Returns the persist promise so earnCoins holds the card disabled for
  // its duration (a second, cheaper guard against rapid re-taps).
  const persistCoins = (coinsEarned: number): Promise<void> =>
    apiService.updateCoins(coinsEarned, newIdemKey()).catch((error) => {
      console.warn('Failed to persist coins via API, kept local credit:', error);
    });

  const handleTryActivity = (activity: ForeplayActivity): Promise<void> => {
    const coinsEarned = activity.coins;
    setTotalCoins(prev => prev + coinsEarned);
    showNotification({
      type: 'success',
      title: tr(`已嘗試 ${activity.title}！`, `Tried ${activity.title}!`),
      message: tr('記得稍後記錄你們的親密時光', 'Remember to record your intimate moment later'),
      coins: coinsEarned,
      duration: 4000
    });
    return persistCoins(coinsEarned);
  };

  const handleTryPosition = (position: PositionSuggestion): Promise<void> => {
    const coinsEarned = position.coins;
    setTotalCoins(prev => prev + coinsEarned);
    showNotification({
      type: 'success',
      title: tr(`已嘗試 ${position.name}！`, `Tried ${position.name}!`),
      message: tr('記得稍後記錄你們的親密時光', 'Remember to record your intimate moment later'),
      coins: coinsEarned,
      duration: 4000
    });
    return persistCoins(coinsEarned);
  };

  const handleCompleteCombo = (combo: typeof comboSuggestions[number]): Promise<void> => {
    const coinsEarned = combo.bonusCoins;
    setTotalCoins(prev => prev + coinsEarned);
    showNotification({
      type: 'success',
      title: tr(`組合技達成 — ${combo.name}！`, `Combo complete: ${combo.name}!`),
      message: tr(`連續完成 ${combo.sequence.length} 種姿勢，記得記錄這次親密時光`, `You did ${combo.sequence.length} positions in a row. Remember to record this intimate moment`),
      coins: coinsEarned,
      duration: 5000,
    });
    return persistCoins(coinsEarned);
  };

  return (
    <div className="space-y-10">
      {/* Foreplay Activities */}
      <div id="foreplay-activities" className="scroll-mt-24">
        <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6">
          {tr('前戲', 'Foreplay')}<em className="not-italic font-light italic text-pink-600">{tr('活動', ' activities')}</em>
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
                  onClick={() => earnCoins(`activity-${index}`, () => handleTryActivity(activity))}
                  disabled={earningKey === `activity-${index}`}
                  className="px-4 py-1.5 bg-petal-ink text-petal-cream rounded-full hover:bg-pink-700 transition-colors flex items-center space-x-1.5 font-display italic text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {earningKey === `activity-${index}` ? <Spinner className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" strokeWidth={1.5} />}
                  <span>{earningKey === `activity-${index}` ? tr('記錄中…', 'Recording…') : tr('嘗試', 'Try it')}</span>
                </button>
              </div>
              <button
                onClick={() => setSelectedActivity(activity)}
                className="font-body text-xs text-petal-ink-soft hover:text-petal-rose-deep transition-colors"
              >
                {tr('查看詳細提示 →', 'See detailed tips →')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Position Suggestions */}
      <div id="position-suggestions" className="scroll-mt-24">
        <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink mb-6">
          {tr('姿勢', 'Position')}<em className="not-italic font-light italic text-pink-600">{tr('建議', ' ideas')}</em>
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
                  position.difficulty === tr('簡單', 'Easy') ? 'border-petal-sage/60 bg-petal-sage/10 text-petal-sage-deep' :
                  position.difficulty === tr('中等', 'Medium') ? 'border-petal-rose-soft bg-petal-rose-soft/30 text-petal-rose-deep' :
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
                  {tr('詳細資訊', 'Details')}
                </button>
                <button
                  onClick={() => earnCoins(`position-${index}`, () => handleTryPosition(position))}
                  disabled={earningKey === `position-${index}`}
                  className="bg-petal-ink text-petal-cream px-3 py-1 rounded-full font-body text-xs hover:bg-pink-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {earningKey === `position-${index}` && <Spinner className="w-3 h-3" />}
                  {earningKey === `position-${index}` ? tr('記錄中…', 'Recording…') : tr('嘗試', 'Try it')}
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
            {tr('連續', 'Combo')}<em className="not-italic font-light italic text-pink-600">{tr('組合技', ' moves')}</em>
          </h3>
          <span className="font-display italic font-light text-sm text-petal-muted">
            {tr('一次連續多種姿勢，額外金幣獎勵', 'Several positions in a row, with bonus coins')}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {comboSuggestions.map((combo, index) => (
            <div key={index} className="border border-petal-rose-soft bg-petal-rose-soft/10 rounded-md p-5 hover:border-petal-rose transition-colors flex flex-col">
              <div className="flex justify-between items-start mb-3">
                <h4 className="font-display text-lg font-medium tracking-tight text-petal-ink">{combo.name}</h4>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] border ${
                  combo.difficulty === tr('簡單', 'Easy') ? 'border-petal-sage/60 bg-petal-sage/10 text-petal-sage-deep' :
                  combo.difficulty === tr('中等', 'Medium') ? 'border-petal-rose-soft bg-petal-rose-soft/30 text-petal-rose-deep' :
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
                  +{combo.bonusCoins} {tr('獎勵', 'Rewards')}
                </div>
                <button
                  onClick={() => earnCoins(`combo-${index}`, () => handleCompleteCombo(combo))}
                  disabled={earningKey === `combo-${index}`}
                  className="px-4 py-1.5 bg-petal-ink text-petal-cream rounded-full hover:bg-pink-700 transition-colors flex items-center space-x-1.5 font-display italic text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {earningKey === `combo-${index}` ? <Spinner className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />}
                  <span>{earningKey === `combo-${index}` ? tr('記錄中…', 'Recording…') : tr('完成組合技', 'Complete the combo')}</span>
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
              <h4 className="font-semibold text-gray-800 mb-2">{tr('實用提示：', 'Practical tips:')}</h4>
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
              {tr('開始嘗試', 'Start')}
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
              <h4 className="font-semibold text-gray-800 mb-2">{tr('優點：', 'Pros:')}</h4>
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
              {tr('嘗試這個姿勢', 'Try this position')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForeplayView;
