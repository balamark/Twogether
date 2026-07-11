import React, { useMemo, useState } from 'react';
import { AlertTriangle, Hand, ShieldAlert, X } from 'lucide-react';
import {
  detectConflictState,
  conflictSeverity,
  type ConflictLevel,
  type ConflictMessage,
} from '../utils/conflictState';

// Stage 0 safety banner. Reads the thread, and when it detects escalation /
// flooding / crisis, shows a gentle, dismissible nudge above the conversation.
// Shared by both surfaces (event thread + wall thread). Non-blocking: it never
// stops the couple from talking, it just names what is happening and offers a
// pause. Dismissal is remembered per thread + level for the session so it does
// not re-nag (a MORE serious level can still surface).

interface Props {
  messages: ConflictMessage[];
  // Stable id for the thread (event id / wall post id) so dismissals don't leak
  // across threads.
  threadKey: string;
}

const STYLES: Record<Exclude<ConflictLevel, 'connection'>, { wrap: string; icon: React.ReactNode }> = {
  escalation: {
    wrap: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: <AlertTriangle className="w-4 h-4 text-amber-500" strokeWidth={1.5} />,
  },
  flooding: {
    wrap: 'bg-orange-50 border-orange-200 text-orange-900',
    icon: <Hand className="w-4 h-4 text-orange-500" strokeWidth={1.5} />,
  },
  crisis: {
    wrap: 'bg-rose-50 border-rose-200 text-rose-900',
    icon: <ShieldAlert className="w-4 h-4 text-rose-500" strokeWidth={1.5} />,
  },
};

const dismissKey = (threadKey: string) => `conflictBannerDismissed:${threadKey}`;

// Remember the highest severity the couple has dismissed for this thread, so a
// re-render (or a new lower-severity blip) doesn't re-open the same banner.
function loadDismissedSeverity(threadKey: string): number {
  try {
    const v = window.localStorage.getItem(dismissKey(threadKey));
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

const ConflictBanner: React.FC<Props> = ({ messages, threadKey }) => {
  const signal = useMemo(() => detectConflictState(messages), [messages]);
  const [dismissedSeverity, setDismissedSeverity] = useState<number>(() =>
    loadDismissedSeverity(threadKey)
  );

  if (signal.level === 'connection') return null;
  const severity = conflictSeverity(signal.level);
  // Only show if this state is MORE serious than anything already dismissed.
  if (severity <= dismissedSeverity) return null;

  const style = STYLES[signal.level];

  const dismiss = () => {
    setDismissedSeverity(severity);
    try {
      window.localStorage.setItem(dismissKey(threadKey), String(severity));
    } catch {
      // best-effort; a failed write just means it may re-show next session
    }
  };

  return (
    <div
      className={`rounded-2xl border px-4 py-3 flex items-start gap-2.5 ${style.wrap}`}
      role="status"
      data-testid="conflict-banner"
      data-level={signal.level}
    >
      <span className="mt-0.5 shrink-0">{style.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-body text-sm font-medium">{signal.title}</p>
        <p className="font-body text-[13px] leading-relaxed mt-0.5 opacity-90">{signal.message}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="稍後再說"
        data-testid="conflict-banner-dismiss"
        className="shrink-0 -mr-1 -mt-0.5 p-1 rounded hover:bg-black/5 transition-colors"
      >
        <X className="w-4 h-4 opacity-60" strokeWidth={1.5} />
      </button>
    </div>
  );
};

export default ConflictBanner;
