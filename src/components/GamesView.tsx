import { Sparkles } from 'lucide-react';
import ForeplayView from './ForeplayView';
import type { Notification } from '../App';
import { tr } from '../i18n/tr';

interface GamesViewProps {
  customMemoryQuestions: string[];
  customEmotions: string[];
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

// Games View Component. Defined at module scope (not inside App) so its identity
// is stable across App re-renders. See issue #41. The romanticGames list embeds
// the user's custom memory questions / emotions, so it is built from props.
const GamesView = ({
  customMemoryQuestions,
  customEmotions,
  showNotification,
}: GamesViewProps) => {
  const romanticGames = [
    {
      title: tr('真心話大冒險', 'Truth or dare'),
      desc: tr('輪流問對方從未問過的問題，增進了解', 'Take turns asking questions you\'ve never asked, and get to know each other better'),
      instructions: [
        tr('1. 準備紙條寫下問題，放入盒子中', '1. Write questions on slips of paper and put them in a box'),
        tr('2. 輪流抽取問題，必須誠實回答', '2. Take turns drawing a question; you must answer honestly'),
        tr('3. 問題可以包括：夢想、恐懼、幻想、回憶', '3. Questions can cover dreams, fears, fantasies, memories'),
        tr('4. 大冒險可以是：唱歌、按摩、親吻、擥抱', '4. Dares can be: singing, a massage, a kiss, a hug'),
        tr('5. 創造安全舒適的環境，互相尊重', '5. Create a safe, comfortable space and respect each other')
      ],
      questions: [
        tr('如果今晚是世界末日，你最想和我做什麼？', 'If tonight were the end of the world, what would you most want to do with me?'),
        tr('你對我身體最著迷的部位是哪裡？', 'Which part of my body do you find most captivating?'),
        tr('描述你心中最完美的約會夜晚', 'Describe your perfect date night'),
        tr('你最想在哪個地方和我親熱？', 'Where would you most like to get intimate with me?'),
        tr('如果可以實現一個性幻想，會是什麼？', 'If you could make one fantasy come true, what would it be?')
      ]
    },
    {
      title: tr('感官按摩', 'Sensual massage'),
      desc: tr('用觸覺喚醒彼此的感官，放鬆身心', 'Awaken each other\'s senses through touch, and relax body and mind'),
      instructions: [
        tr('1. 準備香薰蠟燭和按摩油', '1. Prepare scented candles and massage oil'),
        tr('2. 調暗燈光，播放輕柔音樂', '2. Dim the lights and play soft music'),
        tr('3. 從肩膀開始，慢慢按摩全身', '3. Start at the shoulders and slowly massage the whole body'),
        tr('4. 專注於對方的反應和呼吸', '4. Focus on your partner\'s reactions and breathing'),
        tr('5. 輪流為對方按摩，享受被愛撫的感覺', '5. Take turns, and enjoy being caressed')
      ],
      tips: [
        tr('用溫熱的按摩油，避免太冷', 'Use warm massage oil so it isn\'t cold'),
        tr('變化按摩的力度和節奏', 'Vary the pressure and rhythm'),
        tr('不要忽略敏感部位', 'Don\'t neglect sensitive areas'),
        tr('用指尖輕撫，製造酥麻感', 'Brush lightly with your fingertips for a tingling feeling'),
        tr('按摩時保持眼神交流', 'Keep eye contact while massaging')
      ]
    },
    {
      title: tr('情慾骰子', 'Sexy dice'),
      desc: tr('用骰子決定親密動作，增加刺激感', 'Let the dice decide the next intimate move for extra thrill'),
      instructions: [
        tr('1. 準備兩個骰子（動作骰子和部位骰子）', '1. Prepare two dice (an action die and a body-part die)'),
        tr('2. 動作包括：親吻、撫摸、按摩、舔舐、輕咬、吹氣', '2. Actions: kiss, caress, massage, lick, nibble, blow'),
        tr('3. 部位包括：唇、頸、耳、胸、腰、腿', '3. Body parts: lips, neck, ears, chest, waist, legs'),
        tr('4. 輪流擲骰子，按照結果執行', '4. Take turns rolling and do what the dice say'),
        tr('5. 可以設定時間限制，增加刺激感', '5. Add a time limit for extra excitement')
      ],
      variations: [
        tr('加入溫度元素：冰塊或溫水', 'Add temperature: ice or warm water'),
        tr('使用羽毛或絲巾增加質感', 'Use a feather or silk scarf for texture'),
        tr('設定不同的強度等級', 'Set different intensity levels'),
        tr('加入調情話語的要求', 'Add a flirty-line requirement'),
        tr('結合不同的姿勢或位置', 'Combine with different positions or places')
      ]
    },
    {
      title: tr('慢燃調情', 'Slow burn'),
      desc: tr('用語言和眼神慢慢點燃激情', 'Ignite passion slowly with words and eye contact'),
      instructions: [
        tr('1. 面對面坐著，保持眼神接觸', '1. Sit face to face and keep eye contact'),
        tr('2. 輪流說出對方最性感的特質', '2. Take turns naming your partner\'s sexiest traits'),
        tr('3. 描述你想對對方做的事情', '3. Describe what you want to do to them'),
        tr('4. 用手輕撫但不要碰觸私密部位', '4. Caress lightly but avoid private areas'),
        tr('5. 建立期待感，延遲滿足', '5. Build anticipation and delay gratification')
      ],
      phrases: [
        tr('你知道嗎？當你看著我的時候...', 'You know what? When you look at me...'),
        tr('我一直在想像...', 'I keep imagining...'),
        tr('今晚我想要...', 'Tonight I want...'),
        tr('你讓我感到...', 'You make me feel...'),
        tr('如果我們現在...', 'What if we right now...')
      ]
    },
    {
      title: tr('記憶重現', 'Memory replay'),
      desc: tr('重演你們最難忘的親密時刻', 'Recreate your most unforgettable intimate moment'),
      instructions: [
        tr('1. 分享彼此最難忘的親密回憶', '1. Share your most unforgettable intimate memories'),
        tr('2. 選擇一個想要重演的場景', '2. Choose one scene you\'d like to recreate'),
        tr('3. 儘可能還原當時的情境', '3. Recreate the setting as closely as you can'),
        tr('4. 加入新的元素讓體驗更豐富', '4. Add something new to make it even richer'),
        tr('5. 專注於當時的感覺和情緒', '5. Focus on the feelings and emotions of that time')
      ],
      scenarios: [
        tr('第一次親吻的地點和感覺', 'Where your first kiss happened and how it felt'),
        tr('最浪漫的一次約會夜晚', 'Your most romantic date night'),
        tr('最激情的一次親密時光', 'Your most passionate moment together'),
        tr('最意外的親密時刻', 'Your most unexpected intimate moment'),
        tr('最溫柔纏綿的早晨', 'Your most tender, lingering morning')
      ]
    },
    {
      title: tr('慾望清單', 'Wish list'),
      desc: tr('分享彼此的性幻想和願望', 'Share your fantasies and wishes with each other'),
      instructions: [
        tr('1. 各自寫下5個親密願望', '1. Each write down 5 intimate wishes'),
        tr('2. 交換清單，討論每一項', '2. Swap lists and discuss each item'),
        tr('3. 選擇雙方都感興趣的項目', '3. Choose the ones you\'re both interested in'),
        tr('4. 制定實現這些願望的計劃', '4. Make a plan to make them happen'),
        tr('5. 從最容易實現的開始嘗試', '5. Start with the easiest one')
      ],
      categories: [
        tr('新的地點或環境', 'A new place or setting'),
        tr('不同的角色扮演', 'Different role play'),
        tr('新的親密方式', 'A new way of being intimate'),
        tr('感官刺激體驗', 'Sensory experiences'),
        tr('浪漫情境設定', 'Romantic scene-setting')
      ]
    },
    {
      title: tr('回憶倒帶', 'Memory rewind'),
      desc: tr('App 隨機抽一題溫柔回憶，說完後讓另一方做一個「回饋動作」', 'The app draws a tender memory question at random; after answering, the other person responds with a "feedback gesture"'),
      instructions: [
        tr('1. 一人從下方問題中隨機抽一題', '1. One person draws a random question from below'),
        tr('2. 認真回想，誠實分享你的答案', '2. Think back carefully and share your answer honestly'),
        tr('3. 另一方靜靜聽完，選擇一個回饋動作回應', '3. The other listens quietly, then responds with a feedback gesture'),
        tr('4. 回饋動作：摸頭、擁抱、輕靠肩，或任何溫柔的肢體互動', '4. Feedback gestures: a head pat, a hug, leaning on a shoulder, or any gentle touch'),
        tr('5. 輪流換邊抽題，慢慢回顧你們的點滴', '5. Take turns drawing, and slowly look back on your moments together')
      ],
      questions: [
        tr('第一次覺得對方很可愛是什麼時候？', 'When did you first think they were adorable?'),
        tr('最近一次被對方感動是因為？', 'What moved you most recently about them?'),
        tr('對方做過最讓你心動的小事是什麼？', 'What\'s the little thing they did that made your heart race most?'),
        tr('想到我們最幸福的一天，你會想到哪一天？', 'When you think of your happiest day together, which day comes to mind?'),
        tr('對方哪一個習慣讓你忍不住微笑？', 'Which of their habits always makes you smile?'),
        ...customMemoryQuestions
      ]
    },
    {
      title: tr('情緒模仿秀', 'Emotion charades'),
      desc: tr('抽到一個情緒，不能說話，只能用身體或眼神表演，對方猜', 'Draw an emotion and act it out without words, using only your body or eyes, while your partner guesses'),
      instructions: [
        tr('1. 一人從下方情緒中隨機抽一個', '1. One person draws a random emotion from below'),
        tr('2. 不能說話，只能用身體動作、表情、眼神演出來', '2. No talking; act it out with body movement, expressions and eyes only'),
        tr('3. 對方在 60 秒內猜出情緒', '3. Your partner guesses the emotion within 60 seconds'),
        tr('4. 猜對換邊；猜錯也好玩，互相回饋哪裡演得像、哪裡可以再加強', '4. Switch when they guess right; wrong guesses are fun too, so tell each other what felt right and what could be stronger'),
        tr('5. 過程輕鬆，氣氛帶點曖昧', '5. Keep it light, with a hint of flirtation')
      ],
      emotions: [
        tr('害羞', 'Shy'),
        tr('惹人疼', 'Needing affection'),
        tr('想撒嬌', 'Wanting to be babied'),
        tr('吃醋', 'Jealous'),
        tr('欲拒還迎', 'Playing hard to get'),
        tr('故作冷淡', 'Acting cool'),
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
              {tr('— 情趣', '— Playful')}
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
              {tr('情趣', 'Playful')}<em className="not-italic font-light italic text-pink-600">{tr('遊戲', ' games')}</em>
            </h2>
            <p className="font-display italic font-light text-base text-petal-muted">
              {tr('增進彼此感情的遊戲、前戲與姿勢建議 — 一個個慢慢來。', 'Games, foreplay and position ideas to bring you closer. Take it one at a time.')}
            </p>
          </div>
        </div>
      </div>

      <nav className="!mt-0 sticky top-0 z-20 -mx-4 px-4 py-3 bg-petal-cream/95 backdrop-blur-sm border-b border-petal-rule-soft" aria-label={tr("情趣遊戲分區", 'Playful game sections')}>
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex gap-2 whitespace-nowrap">
            {[
              { id: 'games-list', label: tr('情趣遊戲', 'Playful games') },
              { id: 'foreplay-activities', label: tr('前戲活動', 'Foreplay') },
              { id: 'position-suggestions', label: tr('姿勢建議', 'Positions') },
              { id: 'combo-suggestions', label: tr('連續組合技', 'Combo moves') },
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
          {tr('情趣', 'Playful')}<em className="not-italic font-light italic text-pink-600">{tr('遊戲', ' games')}</em>
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
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">{tr('遊戲步驟', 'How to play')}</h4>
                <ul className="space-y-2">
                  {game.instructions.map((instruction, i) => (
                    <li key={i} className="font-body text-sm text-petal-ink-soft leading-relaxed">{instruction}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-petal-cream-2/50 p-4 rounded-md">
                <h4 className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">
                  {game.questions ? tr('問題範例', 'Example questions') :
                   game.tips ? tr('小貼士', 'Tips') :
                   game.variations ? tr('變化玩法', 'Variations') :
                   game.phrases ? tr('調情話語', 'Flirty lines') :
                   game.scenarios ? tr('場景建議', 'Scene ideas') :
                   game.emotions ? tr('情緒選項', 'Emotion options') : tr('願望類別', 'Wish categories')}
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

      <ForeplayView showNotification={showNotification} />
    </div>
  );
};

export default GamesView;
