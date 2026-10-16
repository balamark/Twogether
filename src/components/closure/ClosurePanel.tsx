import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import apiService, {
  type EventClosure,
  type ClosureAssistField,
  type ClosureReviewTarget,
  type ClosureReviewVerdict,
  type AiUsageToday,
} from '../../services/api';
import CommitmentComposer from './CommitmentComposer';
import ClosureWaitingCard from './ClosureWaitingCard';
import PartnerReviewCard from './PartnerReviewCard';
import ClosureSkipModal from './ClosureSkipModal';
import { tr } from '../../i18n/tr';

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

// Orchestrator: fetches GET /closure once, decides which screen to render, and
// owns every closure mutation. Polls on focus / visibilitychange only — the
// pattern the rest of the app uses; no interval, no websocket.
export default function ClosurePanel({
  eventId,
  partnerNickname,
  quota,
  refreshQuota,
  onResolved,
  onCancelled,
  showNotification,
}: {
  eventId: string;
  partnerNickname?: string;
  quota: AiUsageToday | null;
  refreshQuota: () => void;
  onResolved: () => void | Promise<void>;
  onCancelled: () => void | Promise<void>;
  showNotification: (n: NotificationInput) => void;
}) {
  const [closure, setClosure] = useState<EventClosure | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [assisting, setAssisting] = useState<ClosureAssistField | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // submit is re-submittable while collecting, so after writing you must still
  // be able to go back and change your wording.
  const [revising, setRevising] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await apiService.getEventClosure(eventId);
      setClosure(data);
      // Server has already resolved the event: bubble up so EventDetail can
      // refetch and render the summary card in the resolved block.
      if (data.eventStatus === 'resolved') {
        await onResolved();
      }
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      // The event has already been reopened or cancelled — bubble up and let
      // the parent re-fetch the event; we don't own that state.
      if (code === 'EVENT_NOT_CLOSING') {
        await onCancelled();
        return;
      }
      showNotification({
        type: 'error',
        title: tr('無法取得收尾狀態', 'Couldn\'t load the wrap-up status'),
        message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'),
      });
    } finally {
      setLoading(false);
    }
  }, [eventId, onResolved, onCancelled, showNotification]);

  // `refresh` closes over three parent callbacks, so its identity changes on
  // every parent render unless EVERY ancestor memoizes — which is a promise no
  // caller can reliably keep. Depending on it directly re-fired GET /closure on
  // each render of EventDetail. Route the effects through a ref instead: the
  // fetch is then tied to the event id, which is what actually decides it.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    refreshRef.current();
  }, [eventId]);

  useEffect(() => {
    const onFocus = () => refreshRef.current();
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshRef.current();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const runAssist = async (field: ClosureAssistField): Promise<string[]> => {
    setAssisting(field);
    try {
      const { options } = await apiService.closureAssist(eventId, field);
      if (!options.length) {
        // A 200 with no options is an expected miss, not an error: tell the
        // user what happened and what they can do, so the button never looks dead.
        showNotification({
          type: 'info',
          title: tr('AI 這次沒想到合適的句子', 'The AI couldn\'t come up with a fitting sentence this time'),
          message: tr('請再按一次「幫我想一個」，或直接自己寫一句就好。', 'Tap "Suggest one" again, or just write a sentence yourself.'),
        });
      }
      return options;
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      if (code === 'AI_DAILY_LIMIT_REACHED') {
        showNotification({
          type: 'warning',
          title: tr('今日 AI 次數已用完', 'Today\'s AI credits are used up'),
          message: tr('幫我想一個次數已達今日上限；你仍然可以自己寫，明天會自動補上。', 'You\'ve reached today\'s limit for "Suggest one". You can still write your own; it refills tomorrow.'),
        });
      } else {
        showNotification({
          type: 'error',
          title: tr('幫我想一個暫時無法使用', '"Suggest one" is unavailable right now'),
          message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'),
        });
      }
      return [];
    } finally {
      setAssisting(null);
      refreshQuota();
    }
  };

  const handleSubmit = async (commitment: string, decision: string | null) => {
    setBusy(true);
    try {
      const next = await apiService.submitClosure(eventId, {
        commitment,
        sharedDecision: decision,
      });
      setClosure(next);
      setRevising(false);
      if (next.eventStatus === 'resolved') await onResolved();
      showNotification({
        type: 'success',
        title: tr('你的約定已送出', 'Your commitment has been sent'),
        message: next.partner.status === 'submitted' ? tr(`${partnerNickname || '對方'}已經寫好了`, `${partnerNickname || 'Your partner'} has already finished theirs`) : tr(`等${partnerNickname || '對方'}也寫好`, `Waiting for ${partnerNickname || 'your partner'} to finish too`),
      });
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      const message = err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment');
      showNotification({
        type: code === 'COMMITMENT_TOO_SHORT' ? 'warning' : 'error',
        title: code === 'COMMITMENT_TOO_SHORT' ? tr('約定寫得再具體一點', 'Make your commitment a bit more specific') : tr('無法送出你的約定', 'Couldn\'t send your commitment'),
        message,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReview = async (
    target: ClosureReviewTarget,
    verdict: ClosureReviewVerdict,
    note: string | null
  ) => {
    setBusy(true);
    try {
      const next = await apiService.reviewClosure(eventId, { target, verdict, note });
      setClosure(next);
      if (next.eventStatus === 'resolved') await onResolved();
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('無法送出你的回應', 'Couldn\'t send your response'),
        message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'),
      });
    } finally {
      setBusy(false);
    }
  };

  // An explicit tap always opens. Playbook R4 is about modals that AUTO-fire —
  // suppressing this one after a 再想一下 turned 先不寫，跳過這次 into a dead
  // button for the rest of the session.
  const openSkip = () => setSkipOpen(true);

  const handleSkip = async (reason: string | null) => {
    setBusy(true);
    try {
      const next = await apiService.skipClosure(eventId, reason);
      setClosure(next);
      setSkipOpen(false);
      if (next.eventStatus === 'resolved') await onResolved();
      showNotification({
        type: 'info',
        title: tr('已跳過', 'Skipped'),
        message: next.partner.status === 'submitted' ? tr(`${partnerNickname || '對方'}的約定會保留`, `${partnerNickname || 'Your partner'}'s commitment will be kept`) : tr(`等${partnerNickname || '對方'}的動作`, `Waiting for ${partnerNickname || 'your partner'}`),
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('無法跳過', 'Couldn\'t skip'),
        message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleFinalize = async () => {
    setBusy(true);
    try {
      const next = await apiService.finalizeClosure(eventId);
      setClosure(next);
      if (next.eventStatus === 'resolved') await onResolved();
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      // "暫時還不能結束" is only true for the expected too-early/not-ready gates.
      // A 500 is a failure, and titling it as a gate sends the user off waiting
      // for a clock that was never the problem.
      const expected = code === 'CLOSURE_FINALIZE_TOO_EARLY' || code === 'CLOSURE_NEEDS_YOUR_PART';
      showNotification({
        type: expected ? 'info' : 'error',
        title: expected ? tr('暫時還不能結束', 'It can\'t be closed yet') : tr('無法完成收尾', 'Couldn\'t finish the wrap-up'),
        message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'),
      });
    } finally {
      setBusy(false);
    }
  };

  // 取消收尾 always available while the ceremony is in progress. If nothing has
  // been written yet, /closure/cancel is a clean rollback. Once anyone has
  // submitted it refuses with CLOSURE_ALREADY_STARTED, and the escape is
  // /closure/abandon — NOT /events/:id/reopen, which also nulls therapy_note and
  // so silently deleted the AI summary the couple had just earned. Both closure
  // endpoints drop only draft commitments; nothing is 'active' during closing.
  const handleCancel = async () => {
    setCancelling(true);
    try {
      if (closure?.canCancel) {
        await apiService.cancelClosure(eventId);
      } else {
        await apiService.abandonClosure(eventId);
      }
      await onCancelled();
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('無法回到對話', 'Couldn\'t go back to the conversation'),
        message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment'),
      });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div
        className="bg-petal-sage/15 border border-petal-sage/40 rounded-2xl p-4 text-center text-sm text-petal-ink-soft inline-flex items-center gap-2 justify-center w-full"
        data-testid="event-closure-panel"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        {tr('載入收尾狀態…', 'Loading the wrap-up status…')}
      </div>
    );
  }
  if (!closure) return null;

  const iSubmitted = closure.me.status === 'submitted';
  const partnerSubmitted = closure.partner.status === 'submitted';
  const iReviewed = !!closure.me.reviewedAt;
  // The shared decision's un-reviewed state is 'proposed' (submit writes it);
  // 'pending_review' is the commitment vocabulary and the server never sends it
  // here, so this clause used to be permanently false and Screen 5 never opened
  // for a decision on its own.
  const partnerHasSomethingToReview =
    (closure.partner.commitment && closure.partner.commitment.reviewStatus === 'pending_review') ||
    (closure.sharedDecision && closure.sharedDecisionStatus === 'proposed');

  // Screen 5 wins as soon as partner has submitted AND I still owe a review;
  // otherwise Screen 4 (waiting) shows post-submit and Screen 2 (composer)
  // shows pre-submit. Revising re-opens the composer over whichever it'd be.
  const showReview =
    iSubmitted && partnerSubmitted && !iReviewed && !!partnerHasSomethingToReview && !revising;
  const showWaiting = iSubmitted && !showReview && !revising;

  return (
    // The panel wrapper is the ONLY carrier of this id — the composer and the
    // review card used to repeat it, so a locator for it matched 2–3 nodes and
    // strict-mode assertions became ambiguous. Each screen has its own id.
    <div className="space-y-3" data-testid="event-closure-panel">
      {/* 收尾中 recap header — mirrors the therapy note above the composer so the
          couple can see WHAT they were talking about while writing. TherapyNote
          has no plain summary; the trigger + next-time line is what best
          summarises «why we're here» in one glance. */}
      {closure.therapyNote && (
        <details
          className="bg-white border border-petal-sage/40 rounded-2xl p-3"
          data-testid="closure-recap"
        >
          <summary className="text-xs text-petal-ink-soft cursor-pointer">{tr('上一段對話的重點（點開回顧）', 'Highlights from the last conversation (tap to review)')}</summary>
          <div className="mt-2 text-sm text-petal-ink space-y-2">
            {closure.therapyNote.trigger && (
              <p><span className="text-petal-ink-soft text-xs">{tr('觸發：', 'Trigger: ')}</span>{closure.therapyNote.trigger}</p>
            )}
            {closure.therapyNote.nextTime && (
              <p><span className="text-petal-ink-soft text-xs">{tr('下次先說：', 'Next time, open with: ')}</span>{closure.therapyNote.nextTime}</p>
            )}
          </div>
        </details>
      )}

      {showReview && (
        <PartnerReviewCard
          closure={closure}
          partnerNickname={partnerNickname}
          busy={busy}
          onReview={handleReview}
          onRevise={() => setRevising(true)}
        />
      )}
      {showWaiting && (
        <ClosureWaitingCard
          partnerNickname={partnerNickname}
          canFinalizeAt={closure.canFinalizeAt}
          deadlineAt={closure.deadlineAt}
          finalizing={busy}
          onFinalize={handleFinalize}
          onRevise={() => setRevising(true)}
        />
      )}
      {(!iSubmitted || revising) && (
        <CommitmentComposer
          initialCommitment={closure.me.commitment?.text || ''}
          initialDecision={closure.sharedDecision || ''}
          partnerNickname={partnerNickname}
          quota={quota}
          onAssist={runAssist}
          onSubmit={handleSubmit}
          onSkip={openSkip}
          busy={busy}
          assisting={assisting}
          revising={revising}
          onCancelRevise={() => setRevising(false)}
        />
      )}

      {/* 取消收尾 — always available while status is 'closing'. If nothing has
          been submitted yet this is a clean rollback; once someone has written,
          it reopens the event and drops the drafts (no active commitments to
          lose during closing). Placed at the panel bottom so the primary
          write/review action wins visually. */}
      <div className="flex flex-col items-center gap-1 pt-2 border-t border-petal-rule/50">
        <button
          type="button"
          data-testid="closure-cancel-link"
          disabled={cancelling}
          onClick={handleCancel}
          className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2 disabled:opacity-50"
        >
          {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          {tr('取消收尾，繼續對話', 'Cancel wrap-up and keep talking')}
        </button>
        {!closure.canCancel && (
          <p className="text-[11px] text-petal-ink-soft">{tr('會清空目前寫好的約定，回到原本的對話。', 'This clears the commitments written so far and returns to the conversation.')}</p>
        )}
      </div>

      {skipOpen && (
        <ClosureSkipModal
          partnerNickname={partnerNickname}
          busy={busy}
          onConfirm={handleSkip}
          // Just close it. Nothing auto-opens this modal, so there is no
          // re-fire to suppress — and suppressing it made 先不寫，跳過這次 a dead
          // button for the rest of the session after one 再想一下.
          onCancel={() => setSkipOpen(false)}
        />
      )}
    </div>
  );
}
