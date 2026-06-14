import { Coins, Sparkles } from 'lucide-react';
import ForeplayView from './ForeplayView';
import type { Notification } from '../App';

interface GamesViewProps {
  totalCoins: number;
  customMemoryQuestions: string[];
  customEmotions: string[];
  setTotalCoins: React.Dispatch<React.SetStateAction<number>>;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

// Games View Component. Defined at module scope (not inside App) so its identity
// is stable across App re-renders. See issue #41. The romanticGames list embeds
// the user's custom memory questions / emotions, so it is built from props.
const GamesView = ({
  totalCoins,
  customMemoryQuestions,
  customEmotions,
  setTotalCoins,
  showNotification,
}: GamesViewProps) => {
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

  return (
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
        <div className="overflow-x-auto no-scrollbar">
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

      <ForeplayView setTotalCoins={setTotalCoins} showNotification={showNotification} />
    </div>
  );
};

export default GamesView;
