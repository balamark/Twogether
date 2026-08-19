import React from 'react';
import { Compass, X } from 'lucide-react';
import type { DeepDiveJourney } from '../../services/api';

// A gentle, dismissible "繼續你的情緒深潛" banner (the user's core ask: pause
// now, finish later). Non-blocking (playbook §R4): it never traps the user, and
// dismissing it does not re-fire the same session (App tracks that). Shows for
// both an owner's unfinished journey and a partner's incoming shared letter.
interface Props {
  journey: DeepDiveJourney | { id: string; role?: 'owner' | 'partner'; status: string };
  fromNickname?: string | null;
  onResume: () => void;
  onDismiss: () => void;
}

function label(journey: Props['journey'], fromNickname?: string | null): { title: string; cta: string } {
  const role = 'role' in journey ? journey.role : 'owner';
  if (role === 'partner' || journey.status === 'shared' || journey.status === 'partner_reading') {
    return {
      title: `${fromNickname || '另一半'}想讓你更了解 TA 的感受`,
      cta: '讀讀看',
    };
  }
  return { title: '你有一段情緒深潛還沒走完', cta: '繼續探索' };
}

const DeepDiveResumeBanner: React.FC<Props> = ({ journey, fromNickname, onResume, onDismiss }) => {
  const { title, cta } = label(journey, fromNickname);
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-petal-rule bg-petal-rose-soft/25 px-4 py-3"
      data-testid="deep-dive-resume-banner"
    >
      <Compass className="w-5 h-5 text-petal-rose-deep shrink-0" strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <p className="font-body text-sm text-petal-ink truncate">{title}</p>
        <p className="font-body text-[11px] text-petal-muted">可以先暫停，之後再接著走。</p>
      </div>
      <button
        type="button"
        onClick={onResume}
        className="shrink-0 rounded-full bg-petal-ink text-petal-cream px-4 py-1.5 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition"
        data-testid="deep-dive-resume-cta"
      >
        {cta}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="稍後再說"
        className="shrink-0 text-petal-muted hover:text-petal-ink p-1"
        data-testid="deep-dive-resume-dismiss"
      >
        <X className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  );
};

export default DeepDiveResumeBanner;
