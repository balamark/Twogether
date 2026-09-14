import { useState } from 'react';
import { ChevronRight, HeartHandshake } from 'lucide-react';

// The Conflict Intervention message pattern (NOT a variant of 情緒翻譯).
//
// A message that Sophie mediated shows a deliberate hierarchy:
//   1st — what the sender really wanted you to know (the translation, primary).
//   2nd — what they said in the heat of the moment (the original, blurred until
//         you choose to look).
//
// This is a BUFFER, not a censor: the words are never hidden, deleted, or
// replaced — only reordered so the need is read before the blow.
//   Pause → Translate → Connect.
interface Props {
  original: string;
  translation: string;
  need?: string | null;
  // The viewer's own released message reads slightly differently from a partner's.
  mine: boolean;
}

const SophieHeader = () => (
  <div className="flex items-center gap-1.5 text-petal-rose-deep">
    <HeartHandshake className="w-3.5 h-3.5" strokeWidth={1.5} />
    <span className="font-body text-[11px] font-medium">Sophie 協助表達</span>
  </div>
);

const SophieMessageCard = ({ original, translation, need, mine }: Props) => {
  const [revealed, setRevealed] = useState(false);

  // One stable layout: the translation is always primary (top); the original is
  // always the secondary block below it. Only that block toggles between blurred
  // and revealed — so the reading order never jumps around.
  return (
    <div data-testid="sophie-message-card" data-revealed={revealed ? 'true' : 'false'}>
      {/* Primary: what they really wanted you to know. */}
      <SophieHeader />
      <p className="mt-1 text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">「{translation}」</p>
      {need && (
        <span className="mt-1.5 inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep font-body text-[11px] px-2 py-0.5">
          {mine ? '你' : 'TA'}需要{need}
        </span>
      )}

      {/* Secondary: the heated original — always here at the bottom, blurred
          until asked for. */}
      <div className="mt-3 pt-3 border-t border-dashed border-petal-rose-deep/30">
        <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1">原本的訊息</div>
        {revealed ? (
          <>
            <p className="text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">「{original}」</p>
            <p className="font-body text-[11px] text-petal-muted mt-1.5 leading-relaxed">
              這段話在送出後，Sophie 先幫你們暫停了一下。
            </p>
          </>
        ) : (
          <p
            aria-hidden="true"
            className="text-sm text-petal-ink/70 leading-relaxed whitespace-pre-wrap select-none pointer-events-none blur-[6px]"
          >
            {original}
          </p>
        )}
        {/* Reveal and collapse share the same look — both are obviously tappable. */}
        <button
          type="button"
          data-testid={revealed ? 'sophie-message-collapse' : 'sophie-message-reveal'}
          onClick={() => setRevealed((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-0.5 font-body text-xs font-medium text-petal-rose-deep hover:opacity-80 transition-opacity"
        >
          {revealed ? '收合原話' : '查看原本的訊息'}
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform ${revealed ? 'rotate-90' : ''}`}
            strokeWidth={2}
          />
        </button>
      </div>
    </div>
  );
};

export default SophieMessageCard;
