import { type ReactNode } from 'react';
import { tr } from '../i18n/tr';

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
    titlePlain: tr('翻譯彼此的語言', 'Translating each other\'s language'),
    title: (
      <>
        {tr('翻譯彼此的', 'Translating each other\'s ')}<em className="not-italic font-light italic text-pink-600">{tr('語言', 'language')}</em>
      </>
    ),
    lede: tr('在親密關係裡，最常見的衝突往往不是「不愛了」，而是「聽不懂彼此在說什麼」。', 'In a close relationship, the most common conflict often isn\'t "we\'ve fallen out of love". It\'s "we can\'t understand what the other is saying".'),
    readingTime: tr('一則關於先生與太太、靠近與界線的長文 — 約 5 分鐘閱讀。', 'A long read about a husband and wife, closeness and boundaries. About 5 minutes.'),
    body: (
      <>
        <p>{tr('在一段親密關係裡，最常見的衝突，往往不是「不愛了」，而是「聽不懂彼此在說什麼」。', 'In a close relationship, the most common conflict often isn\'t "we\'ve fallen out of love". It\'s "we can\'t understand what the other is saying".')}</p>
        <p>{tr('很多時候，兩個人其實都還在乎對方，只是用完全不同的方式在表達需求。', 'Very often, both people still care. They\'re just expressing their needs in completely different ways.')}</p>

        {divider}

        <p>{tr('有一對伴侶，先生和太太，正在經歷這樣的狀況。', 'One couple, a husband and a wife, were going through exactly this.')}</p>
        <p>{tr('先生其實不是只想要性。他更多時候，是在某些疲憊或空虛的瞬間，想靠近太太，確認彼此還是連結著的。他會想抱一下、想靠近一點、想讓對方知道：「我還在這裡，我想你也還在我身邊。」', 'He didn\'t only want sex. More often, in moments of tiredness or emptiness, he wanted to be close to her, to make sure they were still connected. He\'d want a hug, to get a little closer, to let her know: "I\'m still here, and I want you to still be by my side."')}</p>
        <p>{tr('而太太其實也不是不在乎他。只是她常常在忙碌、疲累，或情緒沒有空間的時候，需要安靜與界線。', 'And she did care about him. It\'s just that when she was busy, exhausted, or had no room left emotionally, she needed quiet and boundaries.')}</p>
        <p>{tr('問題是，兩個人的「靠近方式」開始產生錯位。', 'The problem was that their "ways of getting close" began to fall out of step.')}</p>

        {divider}

        <p>{tr('有一次，先生又在晚上試著靠近她。他沒有很強烈地要求什麼，只是用那種想要親近的方式，想拉近距離。', 'One night, he tried to get close to her again. He wasn\'t demanding anything; he just reached for closeness in that familiar way.')}</p>
        <p>{tr('但太太那天已經很累了。她一開始其實是溫柔的，她說：「我現在有點累。」', 'But she was already exhausted that day. At first she was gentle. She said, "I\'m a bit tired right now."')}</p>
        <p>{tr('但先生還是想再靠近一點、再確認一點。', 'But he still wanted to get a little closer, to be a little more sure.')}</p>
        <p>{tr('不是故意的，只是他沒有接收到那個「已經不行了」的訊號已經很清楚。', 'He didn\'t mean to. He just didn\'t pick up that her "I can\'t right now" was already clear.')}</p>

        {divider}

        <p>{tr('太太開始感覺到一種熟悉的壓力——她明明已經很溫柔了，但好像還是不被停下來。', 'She started to feel a familiar pressure. She had already been gentle, yet it seemed she still wasn\'t being heard.')}</p>
        <p>{tr('於是她的語氣變了。', 'So her tone changed.')}</p>
        <p>{tr('從溫柔，變成比較直接。', 'From gentle to more direct.')}</p>
        <p>{tr('甚至有一點冷。', 'Even a little cold.')}</p>
        <p>{tr('她心裡想的是：「如果我不講得更清楚，你是不是不會停？」', 'What she was thinking was: "If I don\'t say it more clearly, will you ever stop?"')}</p>
        <p>{tr('但她沒有說出口的是——她並不是不想連結，而是她已經沒有力氣再用更溫柔的方式了。', 'What she didn\'t say was that she didn\'t want to disconnect. She just had no energy left to be gentle about it.')}</p>

        {divider}

        <p>{tr('先生在那一刻感受到的，是另一種痛。', 'In that moment, he felt a different kind of pain.')}</p>
        <p>{tr('他不是被「需求」拒絕，而是感覺到自己好像被推開了。', 'It wasn\'t that a "need" was refused. It felt like he was being pushed away.')}</p>
        <p>{tr('他心裡會想：「我只是想靠近你，為什麼你變得這麼冷？」', 'He thought: "I just wanted to be close to you. Why have you gone so cold?"')}</p>
        <p>{tr('但他沒有看見的是，太太的強硬，其實不是遠離，而是一種防禦。', 'What he didn\'t see was that her firmness wasn\'t distance. It was defense.')}</p>
        <p>{tr('她不是在說「我不愛你」，而是在說：「我需要你現在先停一下，因為我已經沒有空間了。」', 'She wasn\'t saying "I don\'t love you". She was saying: "I need you to stop for now, because I have no room left."')}</p>

        {divider}

        <p>{tr('這就是兩人之間最常見的誤會。', 'This is the most common misunderstanding between two people.')}</p>
        <p className="font-display italic text-petal-ink-soft">{tr('當溫柔沒有被理解時，會變成更強的界線。', 'When gentleness isn\'t understood, it turns into a firmer boundary.')}</p>
        <p className="font-display italic text-petal-ink-soft">{tr('當界線被感覺成拒絕時，會變成更深的失落。', 'When a boundary feels like rejection, it turns into deeper hurt.')}</p>
        <p>{tr('兩個人都在保護自己，但方式卻讓彼此越來越遠。', 'Both are protecting themselves, but in ways that push them further apart.')}</p>

        {divider}

        <p>{tr('後來，他們開始學著翻譯彼此的語言。', 'Over time, they began learning to translate each other\'s language.')}</p>
        <p>{tr('太太慢慢發現，先生很多時候要的不是「做什麼」，而是「還連不連得上」。', 'She slowly realized that what he often wanted wasn\'t "to do something", but "are we still connected?"')}</p>
        <p>{tr('於是她開始嘗試，在無法配合的時候，不只是說「不行」，而是補上一點連結：', 'So when she couldn\'t go along, she started to do more than say "no". She added a little connection:')}</p>
        <ul className="space-y-2 pl-5 list-disc marker:text-petal-rose-deep">
          <li>{tr('輕輕抱一下', 'A gentle hug')}</li>
          <li>{tr('摸一下手', 'A touch of the hand')}</li>
          <li>{tr('說一句：「我現在真的累，但我還在」', 'Saying: "I\'m really tired right now, but I\'m still here"')}</li>
          <li>{tr('或是給一個明確時間：「等一下／晚點／明天」', 'Or giving a clear time: "in a bit / later / tomorrow"')}</li>
        </ul>
        <p>{tr('這些小小的動作，對先生來說，比任何解釋都更有安定感。', 'For him, these small gestures were more reassuring than any explanation.')}</p>

        {divider}

        <p>{tr('而先生也開始理解，太太的直接，不是冷漠，而是她的極限已經到了。', 'And he began to understand that her directness wasn\'t coldness. It meant she had reached her limit.')}</p>
        <p>{tr('她不是不想溫柔，而是她曾經溫柔過，但那種溫柔沒有被理解，於是她只能換一種更清楚的方式保護自己。', 'She did want to be gentle. She had been gentle before, but it wasn\'t understood, so she had to find a clearer way to protect herself.')}</p>

        {divider}

        <p>{tr('慢慢地，他們才發現一件很重要的事：', 'Gradually, they discovered something important:')}</p>
        <p className="font-display italic text-lg text-petal-ink leading-relaxed">{tr('親密關係的問題，從來不是「要不要答應」，而是「有沒有被理解」。', 'The problem in intimacy was never "yes or no". It was "do I feel understood?"')}</p>

        {divider}

        <div className="space-y-3">
          <p><span className="font-medium text-petal-rose-deep">{tr('男生', 'He')}</span>{tr('想要的，很多時候不是結果，而是被肯定、被看見、被連結。', ' often doesn\'t want an outcome. He wants to be affirmed, seen and connected.')}</p>
          <p><span className="font-medium text-petal-rose-deep">{tr('女生', 'She')}</span>{tr('需要的，很多時候不是拒絕，而是界線被尊重，同時關係沒有斷掉。', ' often doesn\'t need to refuse. She needs her boundaries respected while the relationship stays intact.')}</p>
        </div>

        {divider}

        <p>{tr('當兩個人開始願意翻譯彼此的語言時，關係會開始改變。', 'When two people become willing to translate each other\'s language, the relationship starts to change.')}</p>
        <p>{tr('不再是「你要或不要」。', 'It\'s no longer "do you want to or not".')}</p>
        <p>{tr('而變成：', 'It becomes:')}</p>

        <blockquote className="my-2 py-4 px-5 border-l-2 border-petal-rose-soft bg-petal-cream-2/40 font-display italic text-base leading-relaxed text-petal-ink space-y-2">
          <p>{tr('「我現在不行，但我還在。」', '"I can\'t right now, but I\'m still here."')}</p>
          <p>{tr('「我聽見你了，但我們換一種方式靠近。」', '"I hear you. Let\'s find another way to be close."')}</p>
        </blockquote>

        {divider}

        <p className="font-display italic text-lg leading-relaxed text-petal-ink text-center py-2">
          {tr('親密關係真正的成熟，不是永遠一致，而是即使不同步，也不讓彼此失聯。', 'True maturity in a relationship isn\'t always being in sync. It\'s not losing each other even when you\'re out of step.')}
        </p>
      </>
    ),
  },
];
