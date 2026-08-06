import { Clock, Loader2 } from 'lucide-react';
import { formatDateTime } from '../../utils/datetime';
import { useTimezone } from '../../contexts/TimezoneContext';

// Screen 4 — after I submit but before my partner does. Naming the auto-finish
// time («大約⋯») is what turns limbo into a wait. The 先這樣完成 button appears
// only past canFinalizeAt (the 24h grace) to protect the co-writing intent.
export default function ClosureWaitingCard({
  partnerNickname,
  canFinalizeAt,
  deadlineAt,
  finalizing,
  onFinalize,
  onSkip,
}: {
  partnerNickname?: string;
  canFinalizeAt: string | null;
  deadlineAt: string;
  finalizing: boolean;
  onFinalize: () => void;
  onSkip: () => void;
}) {
  const tz = useTimezone();
  const now = Date.now();
  const canFinalizeNow = !!(canFinalizeAt && new Date(canFinalizeAt).getTime() <= now);
  const deadlineLabel = safeFormat(deadlineAt, tz);
  const graceLabel = canFinalizeAt ? safeFormat(canFinalizeAt, tz) : null;

  return (
    <div
      data-testid="closure-waiting-card"
      className="bg-petal-sage/15 border border-petal-sage/40 rounded-2xl p-4 text-center space-y-2"
    >
      <p className="text-sm text-petal-ink inline-flex items-center gap-1.5 justify-center">
        <Clock className="w-4 h-4 text-petal-sage-deep" />
        你的約定已送出，等{partnerNickname || '對方'}也寫好。
      </p>
      <p className="text-xs text-petal-ink-soft leading-relaxed">
        {canFinalizeNow
          ? `${partnerNickname || '對方'}還沒動作。你可以先這樣完成，或再等等。`
          : `${partnerNickname || '對方'}${graceLabel ? ` ${graceLabel} 前` : ''}還沒動作，你就可以「先這樣完成」。若 ${deadlineLabel} 前都沒有回應，系統會安全地為你們結束。`}
      </p>
      <div className="flex justify-center gap-2 pt-1">
        <button
          type="button"
          data-testid="closure-skip-link"
          onClick={onSkip}
          className="text-xs text-petal-ink-soft underline underline-offset-2 hover:text-petal-ink"
        >
          我先跳過
        </button>
        {canFinalizeNow && (
          <button
            type="button"
            data-testid="closure-finalize-button"
            disabled={finalizing}
            onClick={onFinalize}
            className="px-3 py-1.5 rounded-full bg-petal-sage-deep text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition"
          >
            {finalizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            先這樣完成
          </button>
        )}
      </div>
    </div>
  );
}

function safeFormat(iso: string | null, tz: string): string {
  if (!iso) return '';
  try {
    return formatDateTime(iso, tz);
  } catch {
    return '';
  }
}
