import React, { useState } from 'react';
import { Compass, Trash2, X } from 'lucide-react';
import type { DeepDiveJourney } from '../../services/api';
import { tr } from '../../i18n/tr';

// A gentle, dismissible "繼續你的情緒深潛" banner (the user's core ask: pause
// now, finish later). Non-blocking (playbook §R4): it never traps the user, and
// dismissing it does not re-fire the same session (App tracks that). Shows for
// both an owner's unfinished journey and a partner's incoming shared letter.
interface Props {
  journey: DeepDiveJourney | { id: string; role?: 'owner' | 'partner'; status: string };
  fromNickname?: string | null;
  onResume: () => void;
  onDismiss: () => void;
  // Owner-only: cancel + permanently delete the unfinished journey. Without it
  // the only way to make this banner stop was to finish the whole journey.
  onDelete?: () => void;
}

function label(journey: Props['journey'], fromNickname?: string | null): { title: string; cta: string } {
  const role = 'role' in journey ? journey.role : 'owner';
  if (role === 'partner' || journey.status === 'shared' || journey.status === 'partner_reading') {
    return {
      title: tr(`${fromNickname || '另一半'}想讓你更了解 TA 的感受`, `${fromNickname || 'Your partner'} wants you to understand how they feel`),
      cta: tr('讀讀看', 'Read it'),
    };
  }
  return { title: tr('你有一段情緒深潛還沒走完', 'You have an unfinished emotion deep dive'), cta: tr('繼續探索', 'Continue') };
}

const DeepDiveResumeBanner: React.FC<Props> = ({ journey, fromNickname, onResume, onDismiss, onDelete }) => {
  const { title, cta } = label(journey, fromNickname);
  const [confirming, setConfirming] = useState(false);
  const isOwner = !('role' in journey) || journey.role !== 'partner';
  const canDelete = isOwner && !!onDelete;

  if (confirming && canDelete) {
    const shared = journey.status !== 'in_progress';
    return (
      <div
        className="rounded-2xl border border-petal-rule bg-petal-rose-soft/25 px-4 py-3"
        data-testid="deep-dive-delete-confirm"
      >
        <p className="font-body text-sm text-petal-ink">{tr('不想繼續這段情緒深潛了嗎？', 'Don\'t want to continue this emotion deep dive?')}</p>
        <p className="font-body text-[11px] text-petal-muted mt-0.5">
          {shared
            ? tr('刪除後，你寫的信（包括已分享給伴侶的那封）和 TA 的回應都會一起刪除，無法復原。', 'Deleting removes your letters (including the one shared with your partner) and their response. This can\'t be undone.')
            : tr('刪除後，你寫的內容都會一起刪除，無法復原。之後想再探索，隨時可以重新開始。', 'Deleting removes everything you wrote. This can\'t be undone. You can always start a new one later.')}
        </p>
        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-full border border-petal-rule text-petal-ink px-4 py-1.5 text-sm font-body"
            data-testid="deep-dive-delete-cancel"
          >
            {tr('保留', 'Keep it')}
          </button>
          <button
            type="button"
            onClick={() => { setConfirming(false); onDelete!(); }}
            className="rounded-full bg-petal-rose-deep text-white px-4 py-1.5 text-sm font-medium hover:opacity-90"
            data-testid="deep-dive-delete-confirm-btn"
          >
            {tr('刪除這段深潛', 'Delete this deep dive')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-petal-rule bg-petal-rose-soft/25 px-4 py-3"
      data-testid="deep-dive-resume-banner"
    >
      <Compass className="w-5 h-5 text-petal-rose-deep shrink-0" strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <p className="font-body text-sm text-petal-ink truncate">{title}</p>
        <p className="font-body text-[11px] text-petal-muted">
          {canDelete
            ? tr('可以先暫停，之後再接著走；不想繼續也可以刪除。', 'Pause and pick it up later, or delete it if you\'d rather stop.')
            : tr('可以先暫停，之後再接著走。', 'You can pause and pick it up later.')}
        </p>
      </div>
      <button
        type="button"
        onClick={onResume}
        className="shrink-0 rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition"
        data-testid="deep-dive-resume-cta"
      >
        {cta}
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={tr('不想繼續，刪除這段深潛', 'Stop and delete this deep dive')}
          title={tr('不想繼續，刪除這段深潛', 'Stop and delete this deep dive')}
          className="shrink-0 text-petal-muted hover:text-petal-rose-deep p-1"
          data-testid="deep-dive-resume-delete"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={tr("稍後再說", 'Maybe later')}
        className="shrink-0 text-petal-muted hover:text-petal-ink p-1"
        data-testid="deep-dive-resume-dismiss"
      >
        <X className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  );
};

export default DeepDiveResumeBanner;
