import { Clock, Loader2, Pencil } from 'lucide-react';
import { tr } from '../../i18n/tr';

// Screen 4 — after I submit but before my partner does. Whoever has written can
// 先這樣完成 right away; no dates or countdowns to parse. If the partner isn't
// happy with how it ended, they can reopen and rewrite.
export default function ClosureWaitingCard({
  partnerNickname,
  finalizing,
  onFinalize,
  onRevise,
}: {
  partnerNickname?: string;
  finalizing: boolean;
  onFinalize: () => void;
  onRevise: () => void;
}) {
  return (
    <div
      data-testid="closure-waiting-card"
      className="bg-petal-sage/15 border border-petal-sage/40 rounded-2xl p-4 text-center space-y-2"
    >
      <p className="text-sm text-petal-ink inline-flex items-center gap-1.5 justify-center">
        <Clock className="w-4 h-4 text-petal-sage-deep" />
        {tr('你的約定已送出，等', 'Your commitment is in. Waiting for ')}{partnerNickname || tr('對方', 'your partner')}{tr('也寫好。', ' to finish theirs.')}
      </p>
      <p className="text-xs text-petal-ink-soft leading-relaxed">
        {tr('不想等的話，可以直接「先這樣完成」。', 'Don\'t want to wait? You can "finish as-is" now.')}
      </p>
      <div className="flex justify-center gap-2 pt-1">
        {/* 我先跳過 read as "skip my own part" — but I already wrote it. The
            honest action left here is revising what I wrote; 先這樣完成 covers
            not waiting any longer. */}
        <button
          type="button"
          data-testid="closure-revise-link"
          onClick={onRevise}
          className="text-xs text-petal-ink-soft underline underline-offset-2 hover:text-petal-ink inline-flex items-center gap-1"
        >
          <Pencil className="w-3 h-3" />
          {tr('改一下我的約定', 'Edit my commitment')}
        </button>
        <button
          type="button"
          data-testid="closure-finalize-button"
          disabled={finalizing}
          onClick={onFinalize}
          className="px-3 py-1.5 rounded-full bg-petal-sage-deeper text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
        >
          {finalizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {tr('先這樣完成', 'Finish as-is')}
        </button>
      </div>
    </div>
  );
}
