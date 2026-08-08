import { useEffect, useState } from 'react';
import { Clock, Loader2, Pencil } from 'lucide-react';
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
  onRevise,
}: {
  partnerNickname?: string;
  canFinalizeAt: string | null;
  deadlineAt: string;
  finalizing: boolean;
  onFinalize: () => void;
  onRevise: () => void;
}) {
  const tz = useTimezone();
  // The panel only refreshes on focus/visibilitychange, so a card left open
  // across the grace boundary would never grow its 先這樣完成 button. A minute
  // is plenty of resolution for a 24h gate and costs nothing.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
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
      {/* The old string read 「阿哲 8/9 14:00 前還沒動作，你就可以…」, which parses
          as a broken sentence. Lead with 若 so the condition is signposted
          before the clause it governs. */}
      <p className="text-xs text-petal-ink-soft leading-relaxed">
        {canFinalizeNow
          ? `${partnerNickname || '對方'}還沒動作。你可以先這樣完成，或再等等。`
          : `若${partnerNickname || '對方'}${graceLabel ? `到 ${graceLabel}` : ''}都還沒動作，你就可以「先這樣完成」。${deadlineLabel} 前都沒回應的話，系統會安全地為你們結束。`}
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
          改一下我的約定
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
