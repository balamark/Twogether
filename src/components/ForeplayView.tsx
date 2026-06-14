import { useState } from 'react';
import { Coins, Clock, Play, Sparkles, X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { apiService } from '../services/api';
import type { ForeplayActivity, PositionSuggestion, Notification } from '../App';

// Foreplay Activities
const foreplayActivities: ForeplayActivity[] = [
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
const positionSuggestions: PositionSuggestion[] = [
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

export default ForeplayView;
