import { useState } from 'react';
import { Loader2, X, SkipForward } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { tr } from '../../i18n/tr';

// Screen 3 — skip confirm. Skip is a real state (participant status =
// 'skipped'); it never voids the partner's commitment. Optional short reason is
// stored only, never surfaced to the partner in Batch 1.
const SKIP_REASONS = [
  tr('現在還不想寫', 'I\'m not ready to write yet'),
  tr('想先讓{partner}寫', 'I\'d like {partner} to write first'),
  tr('這次不需要寫', 'We don\'t need to write this time'),
];

export default function ClosureSkipModal({
  partnerNickname,
  busy,
  onConfirm,
  onCancel,
}: {
  partnerNickname?: string;
  busy: boolean;
  onConfirm: (reason: string | null) => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  const [reason, setReason] = useState<string | null>(null);
  const reasons = SKIP_REASONS.map((r) => r.replace('{partner}', partnerNickname || tr('對方', 'your partner')));

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      data-testid="closure-skip-modal"
    >
      <div className="bg-petal-cream rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <SkipForward className="w-5 h-5 text-petal-ink-soft" />
            <h3 className="text-lg font-serif text-petal-ink">{tr('先跳過這次', 'Skip this time')}</h3>
          </div>
          <button type="button" onClick={onCancel} aria-label={tr("關閉", 'Close')} className="text-petal-ink-soft hover:text-petal-ink">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-petal-ink-soft leading-relaxed">
          {tr('跳過不會把', 'Skipping won\'t erase ')}{partnerNickname || tr('對方', 'your partner')}{tr('的答案清掉；等', '\'s answer. Once ')}{partnerNickname || tr('對方', 'your partner')}{tr('寫完，這段對話就會安靜地結束。', ' finishes, this conversation will quietly close.')}
        </p>

        <div className="space-y-1.5">
          {reasons.map((label) => (
            <label key={label} className="flex items-center gap-2 text-sm text-petal-ink">
              <input
                type="radio"
                name="closure-skip-reason"
                value={label}
                checked={reason === label}
                onChange={() => setReason(label)}
                className="accent-petal-sage-deep"
              />
              <span>{label}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-petal-ink">
            <input
              type="radio"
              name="closure-skip-reason"
              value=""
              checked={reason === null || reason === ''}
              onChange={() => setReason(null)}
              className="accent-petal-sage-deep"
            />
            <span>{tr('不寫理由', 'No reason')}</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            data-testid="closure-skip-later"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            {tr('再想一下', 'Let me think')}
          </button>
          <button
            type="button"
            data-testid="closure-skip-confirm"
            disabled={busy}
            onClick={() => onConfirm(reason)}
            className="text-sm px-4 py-2 rounded-full bg-petal-ink-soft text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SkipForward className="w-4 h-4" />}
            {tr('跳過這次', 'Skip this time')}
          </button>
        </div>
      </div>
    </div>
  );
}
