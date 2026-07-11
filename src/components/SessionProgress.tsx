import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Gauge, X } from 'lucide-react';
import type { FacilitationSession } from '../services/api';

// The 今日練習 tray: which exercises this session has practised (checklist) and
// the running 關係技巧分數. Makes therapy feel measurable — like learning, not a
// one-off chat. Collapsible so it never nags.
interface Props {
  session: FacilitationSession;
  onEnd: () => void;
  ending?: boolean;
}

const SessionProgress: React.FC<Props> = ({ session, onEnd, ending }) => {
  const [open, setOpen] = useState(true);
  const { completedCardsMeta, activeCardMeta, skillScore, status } = session;

  // In-progress card shows unchecked; already-completed cards show a tick.
  const rows = [
    ...completedCardsMeta.map((c) => ({ meta: c, done: true })),
    ...(activeCardMeta && !completedCardsMeta.some((c) => c.id === activeCardMeta.id)
      ? [{ meta: activeCardMeta, done: false }]
      : []),
  ];

  return (
    <div className="rounded-2xl border border-petal-rule bg-petal-cream-2 px-4 py-3" data-testid="session-progress">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between"
      >
        <span className="inline-flex items-center gap-1.5 font-display italic text-base text-petal-ink">
          <Gauge className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
          今日練習
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="font-body text-xs text-petal-muted">
            關係技巧分數{' '}
            <span className="font-display italic text-petal-rose-deep text-sm">
              {skillScore === null ? '尚未開始' : `${skillScore}%`}
            </span>
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-petal-muted" /> : <ChevronDown className="w-4 h-4 text-petal-muted" />}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {rows.length === 0 ? (
            <p className="font-body text-xs text-petal-muted">引導開始後，練習過的技巧會顯示在這裡。</p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map(({ meta, done }) => (
                <li key={meta.id} className="flex items-center gap-2 font-body text-sm text-petal-ink">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${
                      done ? 'bg-petal-sage/30 border-petal-sage text-petal-sage-deep' : 'border-petal-rule text-petal-muted'
                    }`}
                  >
                    {done ? <Check className="w-3 h-3" strokeWidth={2.5} /> : <span className="text-[10px]">…</span>}
                  </span>
                  <span>{meta.emoji} {meta.label}</span>
                  {!done && <span className="font-body text-[11px] text-petal-rose-deep">進行中</span>}
                </li>
              ))}
            </ul>
          )}

          {status === 'active' && (
            <button
              type="button"
              onClick={onEnd}
              disabled={ending}
              data-testid="session-end-button"
              className="mt-1 inline-flex items-center gap-1 font-body text-xs text-petal-muted hover:text-petal-ink disabled:opacity-50 transition"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              結束這次引導
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionProgress;
