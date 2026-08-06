import { useState } from 'react';
import { Loader2, X, SkipForward } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';

// Screen 3 — skip confirm. Skip is a real state (participant status =
// 'skipped'); it never voids the partner's commitment. Optional short reason is
// stored only, never surfaced to the partner in Batch 1.
const SKIP_REASONS = [
  '現在還不想寫',
  '想先讓{partner}寫',
  '這次不需要寫',
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
  const reasons = SKIP_REASONS.map((r) => r.replace('{partner}', partnerNickname || '對方'));

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      data-testid="closure-skip-modal"
    >
      <div className="bg-petal-cream rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <SkipForward className="w-5 h-5 text-petal-ink-soft" />
            <h3 className="text-lg font-serif text-petal-ink">先跳過這次</h3>
          </div>
          <button type="button" onClick={onCancel} aria-label="關閉" className="text-petal-ink-soft hover:text-petal-ink">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-petal-ink-soft leading-relaxed">
          跳過不會把{partnerNickname || '對方'}的答案清掉；等{partnerNickname || '對方'}寫完，這段對話就會安靜地結束。
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
            <span>不寫理由</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            data-testid="closure-skip-later"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            再想一下
          </button>
          <button
            type="button"
            data-testid="closure-skip-confirm"
            disabled={busy}
            onClick={() => onConfirm(reason)}
            className="text-sm px-4 py-2 rounded-full bg-petal-ink-soft text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SkipForward className="w-4 h-4" />}
            跳過這次
          </button>
        </div>
      </div>
    </div>
  );
}
