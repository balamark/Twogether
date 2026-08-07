import { Sprout } from 'lucide-react';
import type { ClosureCommitment } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';
import { useTimezone } from '../../contexts/TimezoneContext';

// Batch 1's read-only commitment row. Reused by Batches 2–3 (playbook and
// follow-up), so keep it dumb: no click handlers, no menus, no fetches. The
// summary card provides the surrounding shell.
export default function CommitmentCard({
  commitment,
  ownerLabel,
  reviewNote,
}: {
  commitment: ClosureCommitment;
  ownerLabel: string;
  reviewNote?: string | null;
}) {
  const tz = useTimezone();
  const dueLabel = commitment.dueAt ? safeFormat(commitment.dueAt, tz) : null;
  return (
    <div
      data-testid={`commitment-card-${commitment.id}`}
      className="bg-white border border-petal-sage/40 rounded-xl p-3 space-y-1"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-petal-ink-soft inline-flex items-center gap-1">
          <Sprout className="w-3 h-3 text-petal-sage-deep" />
          {ownerLabel}的約定
        </p>
        {dueLabel && (
          <span className="text-[11px] text-petal-ink-soft">預計 {dueLabel} 前回顧</span>
        )}
      </div>
      <p className="text-sm text-petal-ink">{commitment.text}</p>
      {reviewNote && (
        <p className="text-xs text-petal-ink-soft border-l-2 border-petal-rose/50 pl-2 mt-1">
          {reviewNote}
        </p>
      )}
    </div>
  );
}

function safeFormat(iso: string, tz: string): string {
  try {
    return formatDateTime(iso, tz);
  } catch {
    return '';
  }
}
