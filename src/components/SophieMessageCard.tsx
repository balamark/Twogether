import { useState } from 'react';
import { ChevronRight, HeartHandshake } from 'lucide-react';
import { tr } from '../i18n/tr';

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
  // Display name of the AI 諮商師 that helped compose it (the sender's pick).
  companion?: string | null;
}

const SophieHeader = ({ companion }: { companion: string }) => (
  <div className="flex items-center gap-1.5 text-petal-rose-deep">
    <HeartHandshake className="w-3.5 h-3.5" strokeWidth={1.5} />
    <span className="font-body text-[11px] font-medium">{companion} {tr('協助表達', 'Helped phrase it')}</span>
  </div>
);

const SophieMessageCard = ({ original, translation, need, mine, companion }: Props) => {
  const name = companion || tr('AI 諮商師', 'AI counselor');
  const [revealed, setRevealed] = useState(false);

  // One stable layout: the translation is always primary (top); the original is
  // always the secondary block below it. Only that block toggles between blurred
  // and revealed — so the reading order never jumps around.
  return (
    <div data-testid="sophie-message-card" data-revealed={revealed ? 'true' : 'false'}>
      {/* Primary: what they really wanted you to know. */}
      <SophieHeader companion={name} />
      <p className="mt-1 text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">{tr('「', '“')}{translation}{tr('」', '”')}</p>
      {need && (
        <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60 font-body text-[11px] font-medium px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />
          {mine ? tr('你', 'You') : tr('TA', 'They')}{tr('需要', ' need ')}{need}
        </span>
      )}

      {/* Secondary: the heated original — always here at the bottom, blurred
          until asked for. */}
      <div className="mt-3 pt-3 border-t border-dashed border-petal-rose-deep/30">
        <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1">{tr('原本的訊息', 'Original message')}</div>
        {revealed ? (
          <>
            <p className="text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">{tr('「', '“')}{original}{tr('」', '”')}</p>
            <p className="font-body text-[11px] text-petal-muted mt-1.5 leading-relaxed">
              {tr('這段話在送出後，', 'After this was sent, ')}{name} {tr('先幫你們暫停了一下。', ' paused things for a moment.')}
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
        {/* A discrete inline text link, not a pill — reveal and collapse share
            one look so it always reads as the same control. */}
        <button
          type="button"
          data-testid={revealed ? 'sophie-message-collapse' : 'sophie-message-reveal'}
          onClick={() => setRevealed((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 font-body text-xs text-slate-500 hover:text-slate-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
        >
          {revealed ? tr('收合原話', 'Hide original') : tr('查看原本的訊息', 'See the original message')}
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
