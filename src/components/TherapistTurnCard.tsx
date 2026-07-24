import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { MessageFacilitation } from '../services/api';
import ParticipantAvatar from './ParticipantAvatar';

// One AI facilitator turn, rendered as a therapist "card" rather than a plain
// bubble: a coloured card-label chip, what the therapist says, the one small
// instruction, optional quick-reply chips, and (when the last response was
// graded) an evaluation badge.
interface Props {
  facilitation: MessageFacilitation;
  say: string;
  companionLabel: string;
  companionId?: string | null;
  isMyTurn: boolean;
  onQuickReply: (text: string) => void;
}

// Card accent by colour key (see lib/therapyCards.js). Petal-family accents so
// the chips sit inside the app's warm soft-petal system (amber stays: it's the
// one warm hue the palette lacks); kept light so the card reads as a gentle
// prompt, not an alert.
const CHIP: Record<string, string> = {
  rose: 'bg-petal-rose-soft/30 border-petal-rose-soft text-petal-rose-deep',
  sage: 'bg-petal-sage/20 border-petal-sage text-petal-sage-deep',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  neutral: 'bg-petal-cream-2 border-petal-rule text-petal-ink',
};

const VERDICT: Record<string, { label: string; cls: string }> = {
  accurate: { label: '✅ 做到了', cls: 'bg-petal-sage/20 text-petal-sage-deep border-petal-sage' },
  partial: { label: '🟡 差一點', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  off: { label: '❌ 再試一次', cls: 'bg-petal-rose-soft/30 text-petal-rose-deep border-petal-rose-soft' },
};

const TherapistTurnCard: React.FC<Props> = ({ facilitation, say, companionLabel, companionId, isMyTurn, onQuickReply }) => {
  const { cardMeta, instruction, quickReplies, evaluation, evaluatedCardMeta, sessionDone } = facilitation;
  const chip = (cardMeta && CHIP[cardMeta.color]) || CHIP.neutral;

  return (
    <div className="rounded-2xl border border-petal-rose-deep/25 bg-petal-cream p-4 space-y-3" data-testid="therapist-turn-card">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 font-body text-xs font-medium text-petal-rose-deep">
          <ParticipantAvatar size="xs" role="ai" companionId={companionId} name={companionLabel} />
          {companionLabel}
        </span>
        {cardMeta && (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-body text-[11px] font-medium ${chip}`}>
            {cardMeta.emoji} {cardMeta.label}
          </span>
        )}
        {evaluation && (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-body text-[11px] font-medium ${VERDICT[evaluation.verdict]?.cls || ''}`}>
            {VERDICT[evaluation.verdict]?.label || evaluation.verdict}
          </span>
        )}
      </div>

      {evaluation?.note && (
        <p className="font-body text-[13px] text-petal-muted leading-relaxed">
          {/* Name the exercise being graded — the badge sits on the NEXT card's
              turn, so without this it reads as grading the new card. */}
          {evaluatedCardMeta ? `${evaluatedCardMeta.emoji} ${evaluatedCardMeta.label}：${evaluation.note}` : evaluation.note}
        </p>
      )}

      {say && <p className="font-body text-sm text-petal-ink leading-relaxed whitespace-pre-wrap">{say}</p>}

      {instruction && !sessionDone && (
        <div className={`rounded-xl px-3 py-2.5 border ${isMyTurn ? 'border-petal-rose-deep bg-petal-rose-soft/20' : 'border-petal-rule bg-petal-cream-2'}`}>
          <div className="flex items-center gap-1.5 font-body text-[11px] font-medium text-petal-rose-deep mb-1">
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            {isMyTurn ? '換你了' : '這一步'}
          </div>
          <p className="font-body text-sm text-petal-ink leading-relaxed">{instruction}</p>
          {isMyTurn && quickReplies.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {quickReplies.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  data-testid="therapist-quick-reply"
                  onClick={() => onQuickReply(q)}
                  className="rounded-full border border-petal-rose-deep/40 bg-white px-3.5 py-2 font-body text-sm text-petal-ink hover:bg-petal-rose-soft/20 active:scale-[0.98] transition"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TherapistTurnCard;
