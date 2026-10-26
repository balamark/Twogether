import { tr } from '../i18n/tr';

// 替代方案協商 — the two 示範方案 shown in the empty plan list and on the
// logged-out showroom. Static illustration data; "用這個範例開始" copies one into
// the editor so the couple rewrites it in their own words.
export interface AlternativePlanSample {
  id: string;
  title: string;
  interaction: string;
  boundaries: string;
  timePrep: string;
  conditions: string;
}

export const ALTERNATIVE_PLAN_SAMPLES: AlternativePlanSample[] = [
  {
    id: 'sample-slow-night',
    title: tr('慢慢來的親密夜', 'A slow, close night'),
    interaction: tr(
      '從互相按摩和擁抱開始，只進行我們事先都說好、也都喜歡的親密方式，不往下加碼。',
      'Start with a massage and cuddling, and only do the kinds of intimacy we both agreed on beforehand and both enjoy. No escalating beyond that.',
    ),
    boundaries: tr(
      '任何一方說「暫停」就停下來，不需要解釋；停下來之後一起躺著聊聊也很好。',
      'Either of us can say "pause" and we stop, no explanation needed. Lying together and talking afterwards is just as good.',
    ),
    timePrep: tr('約 1 小時。先洗澡、調暗燈光、手機開靜音。', 'About an hour. Shower first, dim the lights, phones on silent.'),
    conditions: tr('當天兩個人都不太累，隔天不用早起；開始前再問一次彼此想不想。', 'Neither of us is too tired and we don\'t have to be up early. Ask each other once more before starting.'),
  },
  {
    id: 'sample-cafe-roleplay',
    title: tr('週末劇本之夜：咖啡店的陌生人', 'Weekend script night: strangers at a café'),
    interaction: tr(
      '把客廳佈置成咖啡店，一人扮演店員、一人扮演第一次來的客人。從點餐的對白開始，照劇情慢慢從陌生到熟悉。',
      'Turn the living room into a café: one plays the barista, the other a first-time customer. Start with the ordering dialogue and follow the plot from strangers to familiar.',
    ),
    boundaries: tr(
      '對白可以即興，但不演出劇本以外的情節；任一方想出戲就說安全詞「打烊了」。',
      'Improvised lines are fine, but nothing outside the script. Either of us can step out by saying the safe word "closing time".',
    ),
    timePrep: tr('約 90 分鐘。準備圍裙、襯衫、兩個咖啡杯和背景音樂。', 'About 90 minutes. Prepare an apron, a shirt, two coffee cups and some background music.'),
    conditions: tr('先一起讀過劇本、確認服裝，約好當天再確認一次彼此的意願。', 'Read the script together and settle the costumes first; check in with each other again on the day.'),
  },
];
