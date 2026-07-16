import { type ReactNode } from 'react';

// 好文 · 故事 — editorial curated long-reads. These are hand-written pieces
// (not user-generated), pinned read-only at the top of the archive list. Kept
// as code (not DB rows) so they carry no author/votes/reports/view-count
// semantics and need no synthetic system user. Moved here from ConflictView
// when 閱讀 merged into 真實故事.

// A static decorative divider between paragraphs. A plain element constant
// (not a component) so this data module has no component definitions.
const divider = (
  <div aria-hidden className="flex justify-center py-2">
    <span className="font-display italic text-petal-muted/60 text-sm tracking-[0.5em]">· · ·</span>
  </div>
);

export interface CuratedReading {
  id: string;
  // Rich title (with emphasis) + a plain-text form for aria/labels.
  title: ReactNode;
  titlePlain: string;
  lede: string;
  readingTime: string;
  body: ReactNode;
}

export const CURATED_READINGS: CuratedReading[] = [
  {
    id: 'translate-each-others-language',
    titlePlain: '翻譯彼此的語言',
    title: (
      <>
        翻譯彼此的<em className="not-italic font-light italic text-pink-600">語言</em>
      </>
    ),
    lede: '在親密關係裡，最常見的衝突往往不是「不愛了」，而是「聽不懂彼此在說什麼」。',
    readingTime: '一則關於先生與太太、靠近與界線的長文 — 約 5 分鐘閱讀。',
    body: (
      <>
        <p>在一段親密關係裡，最常見的衝突，往往不是「不愛了」，而是「聽不懂彼此在說什麼」。</p>
        <p>很多時候，兩個人其實都還在乎對方，只是用完全不同的方式在表達需求。</p>

        {divider}

        <p>有一對伴侶，先生和太太，正在經歷這樣的狀況。</p>
        <p>先生其實不是只想要性。他更多時候，是在某些疲憊或空虛的瞬間，想靠近太太，確認彼此還是連結著的。他會想抱一下、想靠近一點、想讓對方知道：「我還在這裡，我想你也還在我身邊。」</p>
        <p>而太太其實也不是不在乎他。只是她常常在忙碌、疲累，或情緒沒有空間的時候，需要安靜與界線。</p>
        <p>問題是，兩個人的「靠近方式」開始產生錯位。</p>

        {divider}

        <p>有一次，先生又在晚上試著靠近她。他沒有很強烈地要求什麼，只是用那種想要親近的方式，想拉近距離。</p>
        <p>但太太那天已經很累了。她一開始其實是溫柔的，她說：「我現在有點累。」</p>
        <p>但先生還是想再靠近一點、再確認一點。</p>
        <p>不是故意的，只是他沒有接收到那個「已經不行了」的訊號已經很清楚。</p>

        {divider}

        <p>太太開始感覺到一種熟悉的壓力——她明明已經很溫柔了，但好像還是不被停下來。</p>
        <p>於是她的語氣變了。</p>
        <p>從溫柔，變成比較直接。</p>
        <p>甚至有一點冷。</p>
        <p>她心裡想的是：「如果我不講得更清楚，你是不是不會停？」</p>
        <p>但她沒有說出口的是——她並不是不想連結，而是她已經沒有力氣再用更溫柔的方式了。</p>

        {divider}

        <p>先生在那一刻感受到的，是另一種痛。</p>
        <p>他不是被「需求」拒絕，而是感覺到自己好像被推開了。</p>
        <p>他心裡會想：「我只是想靠近你，為什麼你變得這麼冷？」</p>
        <p>但他沒有看見的是，太太的強硬，其實不是遠離，而是一種防禦。</p>
        <p>她不是在說「我不愛你」，而是在說：「我需要你現在先停一下，因為我已經沒有空間了。」</p>

        {divider}

        <p>這就是兩人之間最常見的誤會。</p>
        <p className="font-display italic text-petal-ink-soft">當溫柔沒有被理解時，會變成更強的界線。</p>
        <p className="font-display italic text-petal-ink-soft">當界線被感覺成拒絕時，會變成更深的失落。</p>
        <p>兩個人都在保護自己，但方式卻讓彼此越來越遠。</p>

        {divider}

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

        {divider}

        <p>而先生也開始理解，太太的直接，不是冷漠，而是她的極限已經到了。</p>
        <p>她不是不想溫柔，而是她曾經溫柔過，但那種溫柔沒有被理解，於是她只能換一種更清楚的方式保護自己。</p>

        {divider}

        <p>慢慢地，他們才發現一件很重要的事：</p>
        <p className="font-display italic text-lg text-petal-ink leading-relaxed">親密關係的問題，從來不是「要不要答應」，而是「有沒有被理解」。</p>

        {divider}

        <div className="space-y-3">
          <p><span className="font-medium text-petal-rose-deep">男生</span>想要的，很多時候不是結果，而是被肯定、被看見、被連結。</p>
          <p><span className="font-medium text-petal-rose-deep">女生</span>需要的，很多時候不是拒絕，而是界線被尊重，同時關係沒有斷掉。</p>
        </div>

        {divider}

        <p>當兩個人開始願意翻譯彼此的語言時，關係會開始改變。</p>
        <p>不再是「你要或不要」。</p>
        <p>而變成：</p>

        <blockquote className="my-2 py-4 px-5 border-l-2 border-petal-rose-soft bg-petal-cream-2/40 font-display italic text-base leading-relaxed text-petal-ink space-y-2">
          <p>「我現在不行，但我還在。」</p>
          <p>「我聽見你了，但我們換一種方式靠近。」</p>
        </blockquote>

        {divider}

        <p className="font-display italic text-lg leading-relaxed text-petal-ink text-center py-2">
          親密關係真正的成熟，不是永遠一致，而是即使不同步，也不讓彼此失聯。
        </p>
      </>
    ),
  },
];
