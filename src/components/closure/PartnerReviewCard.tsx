import { useState } from 'react';
import { CheckCircle2, MessageSquarePlus, Loader2 } from 'lucide-react';
import type { EventClosure, ClosureReviewTarget, ClosureReviewVerdict } from '../../services/api';

// Screen 5 — I have submitted; now I see what my partner wrote and respond.
// 就這樣 or 我想調整一下（附建議）. A change request records a note; it does NOT
// block finalize — the plan is deliberate about this. Rendered only after I've
// submitted, since the server withholds partner.commitment until then.
export default function PartnerReviewCard({
  closure,
  partnerNickname,
  busy,
  onReview,
}: {
  closure: EventClosure;
  partnerNickname?: string;
  busy: boolean;
  onReview: (
    target: ClosureReviewTarget,
    verdict: ClosureReviewVerdict,
    note: string | null
  ) => Promise<void>;
}) {
  const partnerCommitment = closure.partner.commitment;
  const [showNoteFor, setShowNoteFor] = useState<ClosureReviewTarget | null>(null);
  const [note, setNote] = useState('');

  const submitReview = async (
    target: ClosureReviewTarget,
    verdict: ClosureReviewVerdict
  ) => {
    if (verdict === 'request_change' && !showNoteFor) {
      setShowNoteFor(target);
      return;
    }
    await onReview(target, verdict, verdict === 'request_change' ? note.trim() || null : null);
    setShowNoteFor(null);
    setNote('');
  };

  const commitmentAlreadyReviewed = partnerCommitment?.reviewStatus && partnerCommitment.reviewStatus !== 'pending_review';
  const decisionAlreadyReviewed = closure.sharedDecision && closure.sharedDecisionStatus !== 'pending_review';

  return (
    <div className="space-y-3" data-testid="event-closure-panel">
      <p className="text-sm text-petal-ink-soft">
        {partnerNickname || '對方'}也寫好了，看看下面這幾件事。你不用同意，只要回應一下。
      </p>

      {partnerCommitment && (
        <section className="bg-white border border-petal-sage/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h4 className="font-serif text-petal-ink text-base">{partnerNickname || '對方'}下次願意做的事</h4>
            {commitmentAlreadyReviewed ? (
              <span className="text-xs text-petal-ink-soft">已回應</span>
            ) : null}
          </div>
          <p
            className="text-sm text-petal-ink bg-petal-cream border border-petal-rule rounded-xl p-3"
            data-testid="closure-partner-commitment"
          >
            {partnerCommitment.text}
          </p>
          {!commitmentAlreadyReviewed && (
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                data-testid="closure-review-change"
                disabled={busy}
                onClick={() => submitReview('commitment', 'request_change')}
                className="text-sm px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-1.5"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                我想調整一下
              </button>
              <button
                type="button"
                data-testid="closure-review-agree"
                disabled={busy}
                onClick={() => submitReview('commitment', 'agree')}
                className="text-sm px-3 py-1.5 rounded-full bg-petal-sage-deep text-white font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                就這樣
              </button>
            </div>
          )}

          {showNoteFor === 'commitment' && (
            <div className="pt-1 space-y-2">
              <textarea
                data-testid="closure-review-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 300))}
                placeholder="想怎麼調整？（會傳給對方看到）"
                rows={2}
                className="w-full text-sm bg-petal-cream border border-petal-rule rounded-xl px-3 py-2 focus:outline-none focus:border-petal-sage-deep"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submitReview('commitment', 'request_change')}
                  className="text-sm px-3 py-1.5 rounded-full bg-petal-sage-deep text-white font-medium disabled:opacity-50"
                >
                  {busy ? '送出中⋯' : '送出建議'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {closure.sharedDecision && (
        <section className="bg-white border border-petal-sage/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h4 className="font-serif text-petal-ink text-base">我們一起決定</h4>
            {decisionAlreadyReviewed ? (
              <span className="text-xs text-petal-ink-soft">已回應</span>
            ) : null}
          </div>
          <p
            className="text-sm text-petal-ink bg-petal-cream border border-petal-rule rounded-xl p-3"
            data-testid="closure-partner-decision"
          >
            {closure.sharedDecision}
          </p>
          {!decisionAlreadyReviewed && (
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => submitReview('decision', 'request_change')}
                className="text-sm px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-1.5"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                我想調整一下
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => submitReview('decision', 'agree')}
                className="text-sm px-3 py-1.5 rounded-full bg-petal-sage-deep text-white font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                就這樣
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
