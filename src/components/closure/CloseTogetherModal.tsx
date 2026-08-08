import { Sprout, Loader2, X } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';

// Screen 1 — confirm sheet before we flip status to 'closing'. Says what
// happens next in plain 中文 so the tap isn't a leap of faith.
export default function CloseTogetherModal({
  busy,
  onConfirm,
  onCancel,
  partnerNickname,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  partnerNickname?: string;
}) {
  useScrollLock(true);
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      data-testid="close-together-modal"
    >
      <div className="bg-petal-cream rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sprout className="w-5 h-5 text-petal-sage-deep" />
            <h3 className="text-lg font-serif text-petal-ink">要一起收尾嗎？</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="關閉"
            className="text-petal-ink-soft hover:text-petal-ink"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-sm text-petal-ink leading-relaxed space-y-2">
          <p>接下來你們兩個各自寫下一件「下次我願意做的小事」，也可以一起決定一件事（例如「孩子睡著後不移動」）。</p>
          <p className="text-petal-ink-soft text-xs">
            寫完之前不會看到{partnerNickname || '對方'}寫的，這是為了讓比較不擅長開口的一方，能寫出自己真正的答案。72 小時內任何一方沒完成，也會安全地結束。
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            data-testid="close-together-later"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20"
          >
            稍後再說
          </button>
          <button
            type="button"
            data-testid="close-together-confirm"
            disabled={busy}
            onClick={onConfirm}
            className="text-sm px-4 py-2 rounded-full bg-petal-sage-deeper text-white font-medium shadow-sm inline-flex items-center gap-2 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sprout className="w-4 h-4" />}
            開始
          </button>
        </div>
      </div>
    </div>
  );
}
