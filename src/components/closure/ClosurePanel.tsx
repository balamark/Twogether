import { useCallback, useEffect, useState } from 'react';
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
  const [skipSuppressed, setSkipSuppressed] = useState(false); // R4: 稍後再說 doesn't re-fire this session
  const [cancelling, setCancelling] = useState(false);

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
        title: '無法取得收尾狀態',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setLoading(false);
    }
  }, [eventId, onResolved, onCancelled, showNotification]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  const runAssist = async (field: ClosureAssistField): Promise<string[]> => {
    setAssisting(field);
    try {
      const { options } = await apiService.closureAssist(eventId, field);
      if (!options.length) {
        // A 200 with no options is an expected miss, not an error: tell the
        // user what happened and what they can do, so the button never looks dead.
        showNotification({
          type: 'info',
          title: 'AI 這次沒想到合適的句子',
          message: '請再按一次「幫我想一個」，或直接自己寫一句就好。',
        });
      }
      return options;
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      if (code === 'AI_DAILY_LIMIT_REACHED') {
        showNotification({
          type: 'warning',
          title: '今日 AI 次數已用完',
          message: '幫我想一個次數已達今日上限；你仍然可以自己寫，明天會自動補上。',
        });
      } else {
        showNotification({
          type: 'error',
          title: '幫我想一個暫時無法使用',
          message: err instanceof Error ? err.message : '請稍後再試',
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
      if (next.eventStatus === 'resolved') await onResolved();
      showNotification({
        type: 'success',
        title: '你的約定已送出',
        message: next.partner.status === 'submitted' ? `${partnerNickname || '對方'}已經寫好了` : `等${partnerNickname || '對方'}也寫好`,
      });
    } catch (err) {
      const code = (err as { error_code?: string })?.error_code;
      const message = err instanceof Error ? err.message : '請稍後再試';
      showNotification({
        type: code === 'COMMITMENT_TOO_SHORT' ? 'warning' : 'error',
        title: code === 'COMMITMENT_TOO_SHORT' ? '約定寫得再具體一點' : '無法送出你的約定',
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
        title: '無法送出你的回應',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setBusy(false);
    }
  };

  const openSkip = () => {
    if (skipSuppressed) return;
    setSkipOpen(true);
  };

  const handleSkip = async (reason: string | null) => {
    setBusy(true);
    try {
      const next = await apiService.skipClosure(eventId, reason);
      setClosure(next);
      setSkipOpen(false);
      if (next.eventStatus === 'resolved') await onResolved();
      showNotification({
        type: 'info',
        title: '已跳過',
        message: next.partner.status === 'submitted' ? `${partnerNickname || '對方'}的約定會保留` : `等${partnerNickname || '對方'}的動作`,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: '無法跳過',
        message: err instanceof Error ? err.message : '請稍後再試',
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
      showNotification({
        type: code === 'CLOSURE_FINALIZE_TOO_EARLY' ? 'info' : 'error',
        title: '暫時還不能結束',
        message: err instanceof Error ? err.message : '請稍後再試',
      });
    } finally {
      setBusy(false);
    }
  };

  // 取消收尾 always available while the ceremony is in progress. If nothing
  // has been written yet, use /closure/cancel (clean rollback). Once anyone
  // has submitted, /closure/cancel refuses with CLOSURE_ALREADY_STARTED — the
  // right escape is /events/:id/reopen, which abandons the closure and drops
  // the draft commitments (there are no 'active' rows yet during closing, so
  // nothing durable is lost).
  const handleCancel = async () => {
    setCancelling(true);
    try {
      if (closure?.canCancel) {
        await apiService.cancelClosure(eventId);
      } else {
        await apiService.reopenEvent(eventId);
      }
      await onCancelled();
    } catch (err) {
      showNotification({
        type: 'error',
        title: '無法回到對話',
        message: err instanceof Error ? err.message : '請稍後再試',
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
        載入收尾狀態…
      </div>
    );
  }
  if (!closure) return null;

  const iSubmitted = closure.me.status === 'submitted';
  const partnerSubmitted = closure.partner.status === 'submitted';
  const iReviewed = !!closure.me.reviewedAt;
  const partnerHasSomethingToReview =
    (closure.partner.commitment && closure.partner.commitment.reviewStatus === 'pending_review') ||
    (closure.sharedDecision && closure.sharedDecisionStatus === 'pending_review');

  // Screen 5 wins as soon as partner has submitted AND I still owe a review;
  // otherwise Screen 4 (waiting) shows post-submit and Screen 2 (composer)
  // shows pre-submit.
  const showReview = iSubmitted && partnerSubmitted && !iReviewed && partnerHasSomethingToReview;
  const showWaiting = iSubmitted && !showReview;

  return (
    <div className="space-y-3">
      {/* 收尾中 recap header — mirrors the therapy note above the composer so the
          couple can see WHAT they were talking about while writing. TherapyNote
          has no plain summary; the trigger + next-time line is what best
          summarises «why we're here» in one glance. */}
      {closure.therapyNote && (
        <details
          className="bg-white border border-petal-sage/40 rounded-2xl p-3"
          data-testid="closure-recap"
        >
          <summary className="text-xs text-petal-ink-soft cursor-pointer">上一段對話的重點（點開回顧）</summary>
          <div className="mt-2 text-sm text-petal-ink space-y-2">
            {closure.therapyNote.trigger && (
              <p><span className="text-petal-ink-soft text-xs">觸發：</span>{closure.therapyNote.trigger}</p>
            )}
            {closure.therapyNote.nextTime && (
              <p><span className="text-petal-ink-soft text-xs">下次先說：</span>{closure.therapyNote.nextTime}</p>
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
        />
      )}
      {showWaiting && (
        <ClosureWaitingCard
          partnerNickname={partnerNickname}
          canFinalizeAt={closure.canFinalizeAt}
          deadlineAt={closure.deadlineAt}
          finalizing={busy}
          onFinalize={handleFinalize}
          onSkip={openSkip}
        />
      )}
      {!iSubmitted && (
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
          取消收尾，繼續對話
        </button>
        {!closure.canCancel && (
          <p className="text-[11px] text-petal-ink-soft">會清空目前寫好的約定，回到原本的對話。</p>
        )}
      </div>

      {skipOpen && (
        <ClosureSkipModal
          partnerNickname={partnerNickname}
          busy={busy}
          onConfirm={handleSkip}
          onCancel={() => {
            setSkipOpen(false);
            setSkipSuppressed(true); // don't re-fire this session (playbook R4)
          }}
        />
      )}
    </div>
  );
}
