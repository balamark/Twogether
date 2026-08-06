import { Sprout, Sparkles, Loader2 } from 'lucide-react';
import type { EventClosure } from '../../services/api';
import CommitmentCard from './CommitmentCard';

// Screen 6 — the resolved-event summary. Sibling of TherapyNoteCard: same
// shell, different content. Shows both commitments (server has revealed the
// partner's by finalize), the 共同決定 (if any), and the AI 見解. If the
// insight failed at finalize, offer a manual retry — the plan is explicit
// that closure never blocks on the LLM, but the user can ask again.
export default function ClosureSummaryCard({
  closure,
  myNickname,
  partnerNickname,
  retryingInsight,
  onRetryInsight,
}: {
  closure: EventClosure;
  myNickname?: string;
  partnerNickname?: string;
  retryingInsight: boolean;
  onRetryInsight: () => void;
}) {
  const myLabel = myNickname || '我';
  const partnerLabel = partnerNickname || '對方';
  const myCommitment = closure.me.commitment;
  const partnerCommitment = closure.partner.commitment;

  return (
    <div
      data-testid="event-closure-summary"
      className="bg-petal-sage/15 border border-petal-sage/40 rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Sprout className="w-4 h-4 text-petal-sage-deep" />
        <h4 className="font-serif text-petal-ink text-base">你們一起定下的下一步</h4>
      </div>

      <div className="space-y-2">
        {myCommitment && (
          <CommitmentCard commitment={myCommitment} ownerLabel={myLabel} />
        )}
        {partnerCommitment && (
          <CommitmentCard
            commitment={partnerCommitment}
            ownerLabel={partnerLabel}
            reviewNote={partnerCommitment.reviewNote}
          />
        )}
      </div>

      {closure.sharedDecision && (
        <div className="bg-white border border-petal-sage/40 rounded-xl p-3">
          <p className="text-xs text-petal-ink-soft mb-1">我們一起決定</p>
          <p className="text-sm text-petal-ink">{closure.sharedDecision}</p>
          {closure.sharedDecisionNote && (
            <p className="text-xs text-petal-ink-soft border-l-2 border-petal-rose/50 pl-2 mt-1">
              {closure.sharedDecisionNote}
            </p>
          )}
        </div>
      )}

      <div className="bg-white border border-petal-sage/40 rounded-xl p-3">
        <p className="text-xs text-petal-ink-soft inline-flex items-center gap-1 mb-1">
          <Sparkles className="w-3 h-3 text-petal-sage-deep" />
          小小的觀察
        </p>
        {closure.insight ? (
          <p
            className="text-sm text-petal-ink leading-relaxed"
            data-testid="closure-insight"
          >
            {closure.insight}
          </p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-petal-ink-soft">見解暫時沒能產生，你可以再試一次。</p>
            <button
              type="button"
              disabled={retryingInsight}
              onClick={onRetryInsight}
              className="text-xs px-3 py-1.5 rounded-full bg-petal-sage-deep text-white font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
            >
              {retryingInsight ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              再試一次
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
