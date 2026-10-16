import { useState } from 'react';
import { CheckCircle2, MessageSquarePlus, Loader2, Pencil } from 'lucide-react';
import type { EventClosure, ClosureReviewTarget, ClosureReviewVerdict } from '../../services/api';
import { tr } from '../../i18n/tr';

// Screen 5 — I have submitted; now I see what my partner wrote and respond.
// 就這樣 or 我想調整一下（附建議）. A change request records a note; it does NOT
// block finalize — the plan is deliberate about this. Rendered only after I've
// submitted, since the server withholds partner.commitment until then.
export default function PartnerReviewCard({
  closure,
  partnerNickname,
  busy,
  onReview,
  onRevise,
}: {
  closure: EventClosure;
  partnerNickname?: string;
  busy: boolean;
  onReview: (
    target: ClosureReviewTarget,
    verdict: ClosureReviewVerdict,
    note: string | null
  ) => Promise<void>;
  onRevise: () => void;
}) {
  const partnerCommitment = closure.partner.commitment;
  const [showNoteFor, setShowNoteFor] = useState<ClosureReviewTarget | null>(null);
  const [note, setNote] = useState('');

  // `note` is one shared state across both sections, so switching which section
  // is asking must clear it — otherwise 我想調整一下 on the decision would submit
  // whatever was typed for the commitment.
  const openNoteFor = (target: ClosureReviewTarget) => {
    setShowNoteFor(target);
    setNote('');
  };

  const submitReview = async (
    target: ClosureReviewTarget,
    verdict: ClosureReviewVerdict
  ) => {
    // Compare against `target`, not just "is any note box open" — with the
    // commitment's box open, a tap on the decision's 我想調整一下 used to skip
    // straight to submitting with the commitment's note attached.
    if (verdict === 'request_change' && showNoteFor !== target) {
      openNoteFor(target);
      return;
    }
    await onReview(target, verdict, verdict === 'request_change' ? note.trim() || null : null);
    setShowNoteFor(null);
    setNote('');
  };

  const commitmentAlreadyReviewed =
    partnerCommitment?.reviewStatus && partnerCommitment.reviewStatus !== 'pending_review';
  // 'proposed' is the un-reviewed state for a shared decision. Comparing to
  // 'pending_review' (the commitment vocabulary, which the server never sends
  // for a decision) made this permanently true, so the section rendered as
  // 已回應 with no buttons and the decision could never actually be reviewed.
  const decisionAlreadyReviewed =
    closure.sharedDecision && closure.sharedDecisionStatus !== 'proposed';

  // Both sections need this identically; inlining it in one of them is how the
  // decision ended up with a 我想調整一下 button and nowhere to write.
  const reviewNote = (target: ClosureReviewTarget) =>
    showNoteFor === target && (
      <div className="pt-1 space-y-2">
        <textarea
          data-testid={`closure-review-note-${target}`}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 300))}
          placeholder={tr("想怎麼調整？（會傳給對方看到）", 'How would you like to adjust it? (your partner will see this)')}
          rows={2}
          className="w-full text-sm bg-petal-cream border border-petal-rule rounded-xl px-3 py-2 focus:outline-none focus:border-petal-sage-deep"
        />
        <div className="flex justify-end">
          <button
            type="button"
            data-testid={`closure-review-note-submit-${target}`}
            disabled={busy}
            onClick={() => submitReview(target, 'request_change')}
            className="text-sm px-3 py-1.5 rounded-full bg-petal-sage-deeper text-white font-medium disabled:opacity-50"
          >
            {busy ? tr('送出中⋯', 'Sending…') : tr('送出建議', 'Send suggestion')}
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-3" data-testid="closure-review-screen">
      <p className="text-sm text-petal-ink-soft">
        {partnerNickname || tr('對方', 'Your partner')}{tr('也寫好了，看看下面這幾件事。你不用同意，只要回應一下。', ' has finished too. Take a look at these. You don\'t have to agree, just respond.')}
      </p>

      {partnerCommitment && (
        <section className="bg-white border border-petal-sage/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h4 className="font-serif text-petal-ink text-base">{partnerNickname || tr('對方', 'Your partner')}{tr('下次願意做的事', '\'s next-time commitment')}</h4>
            {commitmentAlreadyReviewed ? (
              <span className="text-xs text-petal-ink-soft">{tr('已回應', 'Responded')}</span>
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
                {tr('我想調整一下', 'I\'d like to adjust')}
              </button>
              <button
                type="button"
                data-testid="closure-review-agree"
                disabled={busy}
                onClick={() => submitReview('commitment', 'agree')}
                className="text-sm px-3 py-1.5 rounded-full bg-petal-sage-deeper text-white font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {tr('就這樣', 'Agreed')}
              </button>
            </div>
          )}

          {reviewNote('commitment')}
        </section>
      )}

      {closure.sharedDecision && (
        <section className="bg-white border border-petal-sage/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h4 className="font-serif text-petal-ink text-base">{tr('我們一起決定', 'We decided together')}</h4>
            {decisionAlreadyReviewed ? (
              <span className="text-xs text-petal-ink-soft">{tr('已回應', 'Responded')}</span>
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
                data-testid="closure-review-decision-change"
                disabled={busy}
                onClick={() => submitReview('decision', 'request_change')}
                className="text-sm px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-1.5"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                {tr('我想調整一下', 'I\'d like to adjust')}
              </button>
              <button
                type="button"
                data-testid="closure-review-decision-agree"
                disabled={busy}
                onClick={() => submitReview('decision', 'agree')}
                className="text-sm px-3 py-1.5 rounded-full bg-petal-sage-deeper text-white font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {tr('就這樣', 'Agreed')}
              </button>
            </div>
          )}

          {reviewNote('decision')}
        </section>
      )}

      {/* Reading what my partner wrote is the most likely moment to want to
          change my own wording — and submit stays open the whole time we're
          collecting. */}
      <div className="flex justify-center">
        <button
          type="button"
          data-testid="closure-revise-link"
          onClick={onRevise}
          className="text-xs text-petal-ink-soft underline underline-offset-2 hover:text-petal-ink inline-flex items-center gap-1"
        >
          <Pencil className="w-3 h-3" />
          {tr('改一下我的約定', 'Edit my commitment')}
        </button>
      </div>
    </div>
  );
}
